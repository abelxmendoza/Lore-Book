/**
 * Tenant-scoped, worker-specific high-water marks.
 *
 * Persistence reuses `pipeline_runs` (job_id = `hwm:<worker>`). No new table.
 * In-memory copy avoids a read on every tight loop; disk is the restart source.
 *
 * Cursor advances only after the caller reports success. Failed source IDs are
 * kept separately so the next run retries them without replaying history.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export const EVENT_ASSEMBLY_PROCESSING_VERSION = 'v3';
export const EVENT_RECOVERY_PROCESSING_VERSION = 'v1';
export const SEMANTIC_IR_EXTRACTOR_VERSION = 'omega_ingest_v1';
export const RELATIONSHIP_FOUNDATION_PROCESSING_VERSION = 'v1';

export type WorkerRunMode = 'delta' | 'recovery' | 'rebuild';

export type WorkerCursor = {
  processingVersion: string;
  lastProcessedAt: string | null;
  lastId: string | null;
  failedIds: string[];
};

export type DeltaWorkerReport = {
  worker: string;
  userId: string;
  mode: WorkerRunMode;
  rowsScanned: number;
  rowsNew: number;
  rowsChanged: number;
  rowsSkippedAlreadyProcessed: number;
  llmCalls: number;
  embeddingCalls: number;
  writes: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  retryCount: number;
};

const memory = new Map<string, WorkerCursor>();
const claims = new Map<string, number>();

function cacheKey(userId: string, worker: string): string {
  return `${userId}::${worker}`;
}

export function jobIdForWorker(worker: string): string {
  return `hwm:${worker}`;
}

export function emptyCursor(processingVersion: string): WorkerCursor {
  return {
    processingVersion,
    lastProcessedAt: null,
    lastId: null,
    failedIds: [],
  };
}

/** Overlap start so boundary reconstruction can see a few prior rows. */
export function overlapIso(cursorAt: string | null, overlapMs: number): string | null {
  if (!cursorAt) return null;
  const t = new Date(cursorAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - overlapMs).toISOString();
}

export function isHistoricalSweep(mode: WorkerRunMode): boolean {
  return mode === 'recovery' || mode === 'rebuild';
}

export function isStaleProcessingVersion(cursor: WorkerCursor, current: string): boolean {
  return cursor.processingVersion !== current;
}

/**
 * In-memory equivalent of the durable delta query:
 * rows with updated_at >= cursor - overlap, plus failed IDs, capped by budget.
 */
export function filterDeltaRows<T extends { id: string; updated_at: string }>(
  rows: T[],
  cursorAt: string | null,
  overlapMs: number,
  maxRows: number,
  failedIds: string[] = [],
): T[] {
  const since = overlapIso(cursorAt, overlapMs);
  const failed = new Set(failedIds);
  const selected = rows.filter((row) => {
    if (failed.has(row.id)) return true;
    if (!since) return true;
    return row.updated_at >= since;
  });
  const sorted = [...selected].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  if (!since) {
    return sorted.slice(0, maxRows);
  }
  return sorted.slice(0, maxRows);
}

/**
 * Claim exclusive work for this tenant+worker. Returns false if another
 * in-process caller already holds the claim. Dedup happens BEFORE expensive work.
 */
export function claimWorker(userId: string, worker: string): boolean {
  const key = cacheKey(userId, worker);
  if (claims.has(key)) return false;
  claims.set(key, Date.now());
  return true;
}

export function releaseWorker(userId: string, worker: string): void {
  claims.delete(cacheKey(userId, worker));
}

export function isWorkerClaimed(userId: string, worker: string): boolean {
  return claims.has(cacheKey(userId, worker));
}

export async function loadWorkerCursor(
  userId: string,
  worker: string,
  processingVersion: string,
): Promise<WorkerCursor> {
  const key = cacheKey(userId, worker);
  const mem = memory.get(key);
  if (mem) return { ...mem, failedIds: [...mem.failedIds] };

  try {
    const { data, error } = await supabaseAdmin
      .from('pipeline_runs')
      .select('step_results')
      .eq('user_id', userId)
      .eq('job_id', jobIdForWorker(worker))
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const steps = (data.step_results ?? []) as Array<{ metadata?: Record<string, unknown> }>;
      const meta = steps[0]?.metadata;
      if (meta && typeof meta.lastProcessedAt !== 'undefined') {
        const cursor: WorkerCursor = {
          processingVersion: String(meta.processingVersion ?? processingVersion),
          lastProcessedAt: typeof meta.lastProcessedAt === 'string' ? meta.lastProcessedAt : null,
          lastId: typeof meta.lastId === 'string' ? meta.lastId : null,
          failedIds: Array.isArray(meta.failedIds)
            ? meta.failedIds.filter((id): id is string => typeof id === 'string')
            : [],
        };
        memory.set(key, cursor);
        return { ...cursor, failedIds: [...cursor.failedIds] };
      }
    }
  } catch (err) {
    logger.debug({ err, userId, worker }, 'worker_hwm: load from pipeline_runs failed (using empty cursor)');
  }

  const empty = emptyCursor(processingVersion);
  memory.set(key, empty);
  return { ...empty };
}

export async function saveWorkerCursor(
  userId: string,
  worker: string,
  cursor: WorkerCursor,
): Promise<void> {
  const key = cacheKey(userId, worker);
  const next: WorkerCursor = {
    ...cursor,
    failedIds: [...new Set(cursor.failedIds)],
  };
  memory.set(key, next);

  try {
    await supabaseAdmin.from('pipeline_runs').insert({
      job_id: jobIdForWorker(worker),
      user_id: userId,
      status: 'completed',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 0,
      total_steps: 1,
      completed_steps: 1,
      step_results: [
        {
          step: 'cursor',
          success: true,
          duration_ms: 0,
          metadata: {
            processingVersion: next.processingVersion,
            lastProcessedAt: next.lastProcessedAt,
            lastId: next.lastId,
            failedIds: next.failedIds,
          },
        },
      ],
    });
  } catch (err) {
    logger.debug({ err, userId, worker }, 'worker_hwm: persist to pipeline_runs failed (memory kept)');
  }
}

export function advanceCursor(
  cursor: WorkerCursor,
  processed: Array<{ id?: string | null; at: string }>,
  failedIds: string[],
  processingVersion: string,
): WorkerCursor {
  let lastProcessedAt = cursor.lastProcessedAt;
  let lastId = cursor.lastId;
  for (const row of processed) {
    if (!row.at) continue;
    if (!lastProcessedAt || row.at > lastProcessedAt) {
      lastProcessedAt = row.at;
      lastId = row.id ?? lastId;
    }
  }
  return {
    processingVersion,
    lastProcessedAt,
    lastId,
    failedIds: [...new Set(failedIds)],
  };
}

export function logDeltaReport(report: DeltaWorkerReport): void {
  logger.info(report, 'delta_worker.report');
}

/** Test helper — does not touch durable storage. */
export function resetWorkerCursorsForTests(): void {
  memory.clear();
  claims.clear();
}

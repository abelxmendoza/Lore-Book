import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  normalizeJobStatus,
  toWireStatus,
  type IngestionJobStatus,
  type IngestionStage,
  type FailureCategory,
} from './ingestionJobStates';
import { incMetric } from '../chat/chatDurability';

/**
 * Durable write-ahead log for the ingestion queue (`ingestion_jobs` table).
 *
 * The queue stays in-memory for fast in-process execution, but every job is
 * persisted here *before* it runs and removed/marked complete on success — so a
 * crash/deploy can never silently drop memory the user just created. On startup
 * the queue calls `loadResumable()` / `claimNext` to re-enqueue unfinished work.
 *
 * All methods are best-effort and never throw: the chat path must not break if
 * the durability table is briefly unavailable (we degrade to the old in-memory
 * behavior rather than fail the request).
 */

export type PersistJobInput = {
  id: string;
  idempotencyKey: string;
  userId: string;
  chatMessageId: string;
  sessionId: string;
  priority: string;
  payload: Record<string, unknown>;
  logicalStatus?: IngestionJobStatus;
  currentStage?: IngestionStage | string;
  ingestionVersion?: number;
};

export type ResumableJob = {
  id: string;
  idempotency_key: string;
  user_id: string;
  chat_message_id: string | null;
  session_id: string | null;
  priority: string;
  payload: Record<string, unknown>;
  attempts: number;
  status?: string;
  logical_status?: string | null;
  current_stage?: string | null;
  completed_stages?: unknown;
  last_error_code?: string | null;
  last_error_category?: string | null;
  retryable?: boolean | null;
  next_retry_at?: string | null;
  locked_at?: string | null;
  locked_by?: string | null;
};

export type JobSnapshot = {
  id: string;
  idempotencyKey: string;
  userId: string;
  chatMessageId: string | null;
  sessionId: string | null;
  status: IngestionJobStatus;
  wireStatus: string;
  currentStage: string | null;
  completedStages: string[];
  failedStage: string | null;
  lastErrorCode: string | null;
  lastErrorCategory: string | null;
  retryable: boolean | null;
  nextRetryAt: string | null;
  attemptCount: number;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

class IngestionJobStore {
  /**
   * Insert a job as pending/QUEUED. Returns true if newly inserted, false if a job with
   * the same idempotency key already exists (duplicate enqueue — caller skips).
   */
  async persist(input: PersistJobInput): Promise<boolean> {
    try {
      const logical = input.logicalStatus ?? 'QUEUED';
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .upsert(
          {
            id: input.id,
            idempotency_key: input.idempotencyKey,
            user_id: input.userId,
            chat_message_id: input.chatMessageId,
            session_id: input.sessionId,
            priority: input.priority,
            payload: input.payload,
            status: toWireStatus(logical),
            logical_status: logical,
            current_stage: input.currentStage ?? 'RAW_MESSAGE_PERSISTED',
            completed_stages: ['RAW_MESSAGE_PERSISTED'],
            ingestion_version: input.ingestionVersion ?? 1,
            retryable: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: true },
        )
        .select('id');

      if (error) {
        logger.warn({ err: error, jobId: input.id }, 'ingestionJobStore.persist failed (continuing in-memory)');
        return true; // don't block enqueue on durability failure
      }
      // ignoreDuplicates returns [] when the row already existed.
      const isNew = (data?.length ?? 0) > 0;
      if (!isNew) {
        incMetric('duplicate_ingestion_artifacts_prevented');
      } else {
        incMetric('ingestion_jobs_queued');
      }
      return isNew;
    } catch (err) {
      logger.warn({ err, jobId: input.id }, 'ingestionJobStore.persist threw (continuing in-memory)');
      return true;
    }
  }

  /** Look up existing job by idempotency key (chat message id). */
  async findByIdempotencyKey(idempotencyKey: string): Promise<JobSnapshot | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error || !data) return null;
      return this.mapRow(data);
    } catch {
      return null;
    }
  }

  async findByChatMessageId(chatMessageId: string, userId?: string): Promise<JobSnapshot | null> {
    try {
      let q = supabaseAdmin
        .from('ingestion_jobs')
        .select('*')
        .eq('chat_message_id', chatMessageId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q.maybeSingle();
      if (error || !data) return null;
      return this.mapRow(data);
    } catch {
      return null;
    }
  }

  private mapRow(row: Record<string, unknown>): JobSnapshot {
    const stages = row.completed_stages;
    return {
      id: String(row.id),
      idempotencyKey: String(row.idempotency_key),
      userId: String(row.user_id),
      chatMessageId: (row.chat_message_id as string) ?? null,
      sessionId: (row.session_id as string) ?? null,
      status: normalizeJobStatus((row.logical_status as string) ?? (row.status as string)),
      wireStatus: String(row.status ?? 'pending'),
      currentStage: (row.current_stage as string) ?? null,
      completedStages: Array.isArray(stages) ? (stages as string[]) : [],
      failedStage: (row.failed_stage as string) ?? null,
      lastErrorCode: (row.last_error_code as string) ?? null,
      lastErrorCategory: (row.last_error_category as string) ?? null,
      retryable: (row.retryable as boolean) ?? null,
      nextRetryAt: (row.next_retry_at as string) ?? null,
      attemptCount: Number(row.attempts ?? 0),
      lockedAt: (row.locked_at as string) ?? null,
      lockedBy: (row.locked_by as string) ?? null,
      createdAt: (row.created_at as string) ?? null,
      updatedAt: (row.updated_at as string) ?? null,
      completedAt: (row.completed_at as string) ?? null,
    };
  }

  private async update(id: string, patch: Record<string, unknown>): Promise<void> {
    try {
      await supabaseAdmin
        .from('ingestion_jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err) {
      logger.debug({ err, id, patch }, 'ingestionJobStore.update failed');
    }
  }

  markProcessing(id: string, attempts: number, lockedBy?: string): Promise<void> {
    return this.update(id, {
      status: toWireStatus('PROCESSING'),
      logical_status: 'PROCESSING',
      attempts,
      locked_at: new Date().toISOString(),
      locked_by: lockedBy ?? `pid:${process.pid}`,
    });
  }

  /** Back to pending for a scheduled retry — survives a crash during backoff. */
  markRetrying(
    id: string,
    attempts: number,
    error: string,
    opts?: {
      category?: FailureCategory;
      code?: string;
      failedStage?: string;
      nextRetryAt?: Date;
      currentStage?: string;
    },
  ): Promise<void> {
    incMetric('ingestion_jobs_retrying');
    return this.update(id, {
      status: toWireStatus('RETRYABLE_FAILED'),
      logical_status: 'RETRYABLE_FAILED',
      attempts,
      last_error: error.slice(0, 2000),
      last_error_code: opts?.code ?? null,
      last_error_category: opts?.category ?? null,
      failed_stage: opts?.failedStage ?? null,
      current_stage: opts?.currentStage ?? null,
      retryable: true,
      next_retry_at: opts?.nextRetryAt?.toISOString() ?? null,
      locked_at: null,
      locked_by: null,
    });
  }

  markPartial(id: string, failedStage: string, error?: string): Promise<void> {
    return this.update(id, {
      status: toWireStatus('PARTIAL'),
      logical_status: 'PARTIAL',
      failed_stage: failedStage,
      last_error: error?.slice(0, 2000) ?? null,
      locked_at: null,
      locked_by: null,
    });
  }

  markDead(
    id: string,
    error: string,
    opts?: { category?: FailureCategory; code?: string; failedStage?: string },
  ): Promise<void> {
    incMetric('ingestion_jobs_permanent_failure');
    return this.update(id, {
      status: toWireStatus('PERMANENT_FAILED'),
      logical_status: 'PERMANENT_FAILED',
      last_error: error.slice(0, 2000),
      last_error_code: opts?.code ?? null,
      last_error_category: opts?.category ?? null,
      failed_stage: opts?.failedStage ?? null,
      retryable: false,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
  }

  /**
   * Success — mark COMPLETED and keep a short-lived row for diagnostics.
   * Falls back to delete if update fails (legacy behavior).
   */
  async markCompleted(id: string, currentStage: string = 'COMPLETED'): Promise<void> {
    incMetric('ingestion_jobs_completed');
    try {
      const { error } = await supabaseAdmin
        .from('ingestion_jobs')
        .update({
          status: toWireStatus('COMPLETED'),
          logical_status: 'COMPLETED',
          current_stage: currentStage,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          last_error: null,
          retryable: false,
        })
        .eq('id', id);
      if (error) {
        // Legacy path: drop the row so unfinished scans stay small
        await supabaseAdmin.from('ingestion_jobs').delete().eq('id', id);
      }
    } catch (err) {
      logger.debug({ err, id }, 'ingestionJobStore.markCompleted failed');
      try {
        await supabaseAdmin.from('ingestion_jobs').delete().eq('id', id);
      } catch {
        /* ignore */
      }
    }
  }

  async recordStage(
    id: string,
    stage: IngestionStage | string,
    completedStages?: string[],
  ): Promise<void> {
    const patch: Record<string, unknown> = { current_stage: stage };
    if (completedStages) patch.completed_stages = completedStages;
    await this.update(id, patch);
  }

  /**
   * Concurrency-safe reclaim of stale PROCESSING locks (worker crash / Railway restart).
   * Returns number of rows reclaimed.
   */
  async reclaimStaleLocks(staleAfterMs = 10 * 60 * 1000, limit = 100): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
    try {
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .update({
          status: 'pending',
          logical_status: 'QUEUED',
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .in('status', ['pending', 'processing'])
        .lt('locked_at', cutoff)
        .not('locked_at', 'is', null)
        .select('id')
        .limit(limit);

      if (error) {
        logger.warn({ err: error }, 'ingestionJobStore.reclaimStaleLocks failed');
        return 0;
      }
      const n = data?.length ?? 0;
      if (n > 0) incMetric('stale_jobs_reclaimed', n);
      return n;
    } catch (err) {
      logger.warn({ err }, 'ingestionJobStore.reclaimStaleLocks threw');
      return 0;
    }
  }

  /**
   * Load all unfinished jobs (pending + interrupted 'processing') so the queue
   * can re-enqueue them on startup. This is the crash-recovery payoff.
   */
  async loadResumable(limit = 1000): Promise<ResumableJob[]> {
    try {
      // Reclaim stale locks first so crashed workers don't strand work.
      await this.reclaimStaleLocks();

      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .select(
          'id, idempotency_key, user_id, chat_message_id, session_id, priority, payload, attempts, status, logical_status, current_stage, completed_stages, last_error_code, last_error_category, retryable, next_retry_at, locked_at, locked_by',
        )
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) {
        logger.warn({ err: error }, 'ingestionJobStore.loadResumable failed');
        return [];
      }
      return (data ?? []) as ResumableJob[];
    } catch (err) {
      logger.warn({ err }, 'ingestionJobStore.loadResumable threw');
      return [];
    }
  }
}

export const ingestionJobStore = new IngestionJobStore();

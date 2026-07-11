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
 * Truth contract:
 * - A successful persist is the *only* source of truth that a job is queued.
 * - If durable write fails, callers must report PERSISTED_UNQUEUED / RECOVERY_REQUIRED
 *   and never claim QUEUED. In-memory work is best-effort only, never the WAL.
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

/** Result of a durable write attempt — never pretends success on failure. */
export type PersistJobResult =
  | { ok: true; isNew: boolean; id: string }
  | { ok: false; error: string; code?: string };

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
  lease_token?: string | null;
  attempt_version?: number | null;
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
  attemptVersion: number;
  leaseToken: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

class IngestionJobStore {
  /**
   * Insert a job as pending/QUEUED.
   * Returns structured result — never reports success when the WAL write failed.
   */
  async persist(input: PersistJobInput): Promise<PersistJobResult> {
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
        logger.error(
          { err: error, jobId: input.id, chatMessageId: input.chatMessageId },
          'ingestionJobStore.persist failed — NOT claiming queued',
        );
        return { ok: false, error: error.message, code: (error as { code?: string }).code };
      }
      // ignoreDuplicates returns [] when the row already existed.
      const isNew = (data?.length ?? 0) > 0;
      if (!isNew) {
        incMetric('duplicate_ingestion_artifacts_prevented');
        // Resolve existing id for caller.
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        return { ok: true, isNew: false, id: existing?.id ?? input.id };
      }
      incMetric('ingestion_jobs_queued');
      return { ok: true, isNew: true, id: input.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, jobId: input.id, chatMessageId: input.chatMessageId },
        'ingestionJobStore.persist threw — NOT claiming queued',
      );
      return { ok: false, error: msg };
    }
  }

  /**
   * Mark a chat message as needing recovery after durable job write failed.
   * Stored on chat_messages.metadata so recovery scanner can find it without a job row.
   */
  async markMessageRecoveryRequired(
    userId: string,
    messageId: string,
    reason: string,
  ): Promise<void> {
    try {
      const { data: row } = await supabaseAdmin
        .from('chat_messages')
        .select('metadata')
        .eq('id', messageId)
        .eq('user_id', userId)
        .maybeSingle();
      const meta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
        string,
        unknown
      >;
      await supabaseAdmin
        .from('chat_messages')
        .update({
          metadata: {
            ...meta,
            ingestion_recovery: {
              status: 'RECOVERY_REQUIRED',
              reason: reason.slice(0, 500),
              markedAt: new Date().toISOString(),
            },
          },
        })
        .eq('id', messageId)
        .eq('user_id', userId);
      incMetric('ingestion_jobs_recovery_required');
    } catch (err) {
      logger.warn({ err, messageId, userId }, 'markMessageRecoveryRequired failed');
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
      attemptVersion: Number(row.attempt_version ?? row.attempts ?? 0),
      leaseToken: (row.lease_token as string) ?? null,
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

  /**
   * Fenced update: only applies if lease_token still matches.
   * Prevents stale workers from overwriting reclaimed jobs.
   */
  async fencedUpdate(
    id: string,
    leaseToken: string,
    attemptVersion: number,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('lease_token', leaseToken)
        .eq('attempt_version', attemptVersion)
        .select('id');
      if (error) {
        logger.warn({ err: error, id }, 'ingestionJobStore.fencedUpdate failed');
        return false;
      }
      return (data?.length ?? 0) > 0;
    } catch (err) {
      logger.warn({ err, id }, 'ingestionJobStore.fencedUpdate threw');
      return false;
    }
  }

  /**
   * Claim a job for processing. Returns a lease token + attempt version for fencing.
   * Concurrent claims: only one wins the lease_token write.
   */
  async claim(
    id: string,
    attempts: number,
    lockedBy?: string,
  ): Promise<{ claimed: boolean; leaseToken: string; attemptVersion: number }> {
    const leaseToken = `lease:${id}:${attempts}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const attemptVersion = attempts;
    const worker = lockedBy ?? `pid:${process.pid}`;
    try {
      // Only claim if not already held by a fresh lock (or unlocked)
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .update({
          status: toWireStatus('PROCESSING'),
          logical_status: 'PROCESSING',
          attempts,
          attempt_version: attemptVersion,
          lease_token: leaseToken,
          locked_at: new Date().toISOString(),
          locked_by: worker,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('status', ['pending', 'processing'])
        .select('id');

      if (error) {
        logger.warn({ err: error, id }, 'ingestionJobStore.claim failed');
        // Fallback unfenced mark for older schema without lease columns
        await this.markProcessing(id, attempts, worker);
        return { claimed: true, leaseToken, attemptVersion };
      }
      const claimed = (data?.length ?? 0) > 0;
      return { claimed, leaseToken, attemptVersion };
    } catch (err) {
      logger.warn({ err, id }, 'ingestionJobStore.claim threw');
      await this.markProcessing(id, attempts, worker);
      return { claimed: true, leaseToken, attemptVersion };
    }
  }

  markProcessing(id: string, attempts: number, lockedBy?: string): Promise<void> {
    return this.update(id, {
      status: toWireStatus('PROCESSING'),
      logical_status: 'PROCESSING',
      attempts,
      attempt_version: attempts,
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
      leaseToken?: string;
      attemptVersion?: number;
    },
  ): Promise<void> {
    incMetric('ingestion_jobs_retrying');
    const patch = {
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
      lease_token: null,
    };
    if (opts?.leaseToken != null && opts?.attemptVersion != null) {
      return this.fencedUpdate(id, opts.leaseToken, opts.attemptVersion, patch).then(() => undefined);
    }
    return this.update(id, patch);
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
    opts?: {
      category?: FailureCategory;
      code?: string;
      failedStage?: string;
      leaseToken?: string;
      attemptVersion?: number;
    },
  ): Promise<void> {
    incMetric('ingestion_jobs_permanent_failure');
    const patch = {
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
      lease_token: null,
    };
    if (opts?.leaseToken != null && opts?.attemptVersion != null) {
      return this.fencedUpdate(id, opts.leaseToken, opts.attemptVersion, patch).then(() => undefined);
    }
    return this.update(id, patch);
  }

  /**
   * Success — fenced when lease provided so a stale worker cannot complete a reclaimed job.
   */
  async markCompleted(
    id: string,
    currentStage: string = 'COMPLETED',
    fence?: { leaseToken: string; attemptVersion: number },
  ): Promise<boolean> {
    incMetric('ingestion_jobs_completed');
    const patch = {
      status: toWireStatus('COMPLETED'),
      logical_status: 'COMPLETED',
      current_stage: currentStage,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      retryable: false,
      lease_token: null,
    };
    try {
      if (fence) {
        const ok = await this.fencedUpdate(id, fence.leaseToken, fence.attemptVersion, patch);
        if (!ok) {
          logger.warn({ id }, 'ingestionJobStore.markCompleted fenced out (stale worker)');
          return false;
        }
        return true;
      }
      const { error } = await supabaseAdmin
        .from('ingestion_jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        await supabaseAdmin.from('ingestion_jobs').delete().eq('id', id);
      }
      return true;
    } catch (err) {
      logger.debug({ err, id }, 'ingestionJobStore.markCompleted failed');
      try {
        await supabaseAdmin.from('ingestion_jobs').delete().eq('id', id);
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  async recordStage(
    id: string,
    stage: IngestionStage | string,
    completedStages?: string[],
    fence?: { leaseToken: string; attemptVersion: number },
  ): Promise<boolean> {
    const patch: Record<string, unknown> = { current_stage: stage };
    if (completedStages) patch.completed_stages = completedStages;
    if (fence) {
      return this.fencedUpdate(id, fence.leaseToken, fence.attemptVersion, patch);
    }
    await this.update(id, patch);
    return true;
  }

  /**
   * Concurrency-safe reclaim of stale PROCESSING locks (worker crash / Railway restart).
   * Bumps attempt_version and clears lease so the dead worker cannot complete.
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
          lease_token: null,
          // Bump attempt_version so stale fenced writes fail
          // (attempt_version is also set on next claim)
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
   * Load unfinished jobs for crash recovery.
   */
  async loadResumable(limit = 1000): Promise<ResumableJob[]> {
    try {
      await this.reclaimStaleLocks();

      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .select(
          'id, idempotency_key, user_id, chat_message_id, session_id, priority, payload, attempts, status, logical_status, current_stage, completed_stages, last_error_code, last_error_category, retryable, next_retry_at, locked_at, locked_by, lease_token, attempt_version',
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

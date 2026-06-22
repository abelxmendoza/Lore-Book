import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Durable write-ahead log for the ingestion queue (`ingestion_jobs` table).
 *
 * The queue stays in-memory for fast in-process execution, but every job is
 * persisted here *before* it runs and removed on success — so a crash/deploy can
 * never silently drop memory the user just created. On startup the queue calls
 * `loadResumable()` to re-enqueue anything left unfinished.
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
};

class IngestionJobStore {
  /**
   * Insert a job as pending. Returns true if newly inserted, false if a job with
   * the same idempotency key already exists (duplicate enqueue — caller skips).
   */
  async persist(input: PersistJobInput): Promise<boolean> {
    try {
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
            status: 'pending',
          },
          { onConflict: 'idempotency_key', ignoreDuplicates: true },
        )
        .select('id');

      if (error) {
        logger.warn({ err: error, jobId: input.id }, 'ingestionJobStore.persist failed (continuing in-memory)');
        return true; // don't block enqueue on durability failure
      }
      // ignoreDuplicates returns [] when the row already existed.
      return (data?.length ?? 0) > 0;
    } catch (err) {
      logger.warn({ err, jobId: input.id }, 'ingestionJobStore.persist threw (continuing in-memory)');
      return true;
    }
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

  markProcessing(id: string, attempts: number): Promise<void> {
    return this.update(id, { status: 'processing', attempts });
  }

  /** Back to pending for a scheduled retry — survives a crash during backoff. */
  markRetrying(id: string, attempts: number, error: string): Promise<void> {
    return this.update(id, { status: 'pending', attempts, last_error: error.slice(0, 2000) });
  }

  markDead(id: string, error: string): Promise<void> {
    return this.update(id, { status: 'dead', last_error: error.slice(0, 2000) });
  }

  /** Success — the durable row is no longer needed; delete to keep the table small. */
  async markCompleted(id: string): Promise<void> {
    try {
      await supabaseAdmin.from('ingestion_jobs').delete().eq('id', id);
    } catch (err) {
      logger.debug({ err, id }, 'ingestionJobStore.markCompleted delete failed');
    }
  }

  /**
   * Load all unfinished jobs (pending + interrupted 'processing') so the queue
   * can re-enqueue them on startup. This is the crash-recovery payoff.
   */
  async loadResumable(limit = 1000): Promise<ResumableJob[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ingestion_jobs')
        .select('id, idempotency_key, user_id, chat_message_id, session_id, priority, payload, attempts')
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

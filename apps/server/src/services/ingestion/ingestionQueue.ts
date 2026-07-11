// =====================================================
// ASYNC INGESTION QUEUE
//
// Lightweight in-process priority queue for conversation ingestion jobs.
// Moves the 12-step ingestion pipeline fully off the chat critical path.
//
// Design constraints:
//   - Single-server, single-process (no Kafka/RabbitMQ/BullMQ)
//   - Per-user FIFO ordering preserved within each priority tier
//   - Bounded concurrency to prevent memory/API-rate exhaustion
//   - Exponential backoff retry (1s → 2s → 4s)
//   - Dead-letter persistence for jobs that exhaust retries
//   - Zero dependencies beyond existing project infrastructure
//
// When to upgrade this to pg_notify-backed workers:
//   - Multiple server instances required (horizontal scaling)
//   - Process crash must not lose queued jobs
//   - Queue depth routinely exceeds 500 items
// =====================================================

import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { runWithMessageCost } from '../../lib/messageCostTracker';
import { supabaseAdmin } from '../supabaseClient';
import { pipelineRunService } from './pipelineRunService';
import { ingestionJobStore } from './ingestionJobStore';
import {
  classifyIngestionError,
  computeRetryDelayMs,
} from './ingestionJobStates';
import { incMetric } from '../chat/chatDurability';

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobPriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface IngestionJobPayload {
  userId: string;
  chatMessageId: string;
  sessionId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Re-ingest even if this message was already ingested (used by corrections). */
  force?: boolean;
}

export type EnqueueResult = {
  jobId: string;
  /** False when an existing durable job already covered this message. */
  isNew: boolean;
  status: 'QUEUED' | 'DUPLICATE' | 'DROPPED';
};

interface IngestionJob extends IngestionJobPayload {
  id: string;
  /** Durable dedup key — one ingestion per message (force adds a timestamp). */
  idempotencyKey: string;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  lastError?: string;
}

// ─── Queue ───────────────────────────────────────────────────────────────────

/**
 * Index of the first job in `q` whose user is not already in flight, preserving
 * FIFO for that user. Returns -1 when every queued job belongs to a busy user.
 * Pure + exported for unit testing the per-user serialization invariant.
 */
export function pickEligibleIndex(
  q: Array<{ userId: string }>,
  activeUsers: ReadonlySet<string>,
): number {
  for (let i = 0; i < q.length; i++) {
    if (!activeUsers.has(q[i].userId)) return i;
  }
  return -1;
}

class IngestionQueue {
  private readonly queues: Record<JobPriority, IngestionJob[]> = {
    HIGH:   [],
    NORMAL: [],
    LOW:    [],
  };

  // Maximum parallel jobs running at once.
  // Keep low: each job makes multiple DB + OpenAI calls.
  private readonly CONCURRENCY = 2;

  // Circuit breaker: stop accepting new jobs when queue depth exceeds this.
  private readonly MAX_QUEUE_DEPTH = 1000;

  private activeJobs = 0;
  // Users with a job currently in flight. Guarantees at most one ingestion per
  // user at a time → per-user FIFO + no concurrent entity-create race (two of a
  // user's messages can't both resolve "Tony" against a pre-insert snapshot and
  // each mint a duplicate). Cross-user concurrency is unaffected.
  private readonly activeUsers = new Set<string>();
  private totalEnqueued = 0;
  private totalCompleted = 0;
  private totalFailed = 0;

  /**
   * Enqueue a new ingestion job (fire-and-forget). Prefer enqueueDurable when
   * the caller needs a committed job row before optional AI work can fail.
   */
  enqueue(payload: IngestionJobPayload, priority: JobPriority = 'NORMAL'): string {
    const depth = this.depth();
    if (depth >= this.MAX_QUEUE_DEPTH) {
      logger.warn(
        { depth, userId: payload.userId },
        'IngestionQueue: circuit breaker tripped — queue full, dropping job'
      );
      return '';
    }

    const job = this.buildJob(payload, priority);
    this.totalEnqueued++;
    // Durably persist BEFORE in-memory processing so a crash/deploy can't drop
    // the job. Non-blocking path for legacy callers.
    void this.persistThenQueue(job);
    return job.id;
  }

  /**
   * Await write-ahead persist so the chat path can report truth-backed ingestion
   * status even if assistant generation fails immediately after.
   */
  async enqueueDurable(
    payload: IngestionJobPayload,
    priority: JobPriority = 'NORMAL',
  ): Promise<EnqueueResult> {
    const depth = this.depth();
    if (depth >= this.MAX_QUEUE_DEPTH) {
      logger.warn(
        { depth, userId: payload.userId },
        'IngestionQueue: circuit breaker tripped — queue full, dropping job'
      );
      return { jobId: '', isNew: false, status: 'DROPPED' };
    }

    const job = this.buildJob(payload, priority);
    this.totalEnqueued++;
    const isNew = await this.persistThenQueue(job);
    if (!isNew) {
      const existing = await ingestionJobStore.findByIdempotencyKey(job.idempotencyKey);
      return {
        jobId: existing?.id ?? job.id,
        isNew: false,
        status: 'DUPLICATE',
      };
    }
    return { jobId: job.id, isNew: true, status: 'QUEUED' };
  }

  private buildJob(payload: IngestionJobPayload, priority: JobPriority): IngestionJob {
    return {
      ...payload,
      id: randomUUID(),
      idempotencyKey: payload.force
        ? `${payload.chatMessageId}:force:${Date.now()}`
        : payload.chatMessageId,
      priority,
      attempts: 0,
      maxAttempts: 5,
      createdAt: Date.now(),
    };
  }

  /** Write-ahead persist, then schedule in-memory. Dedupes via idempotency key. */
  private async persistThenQueue(job: IngestionJob): Promise<boolean> {
    const isNew = await ingestionJobStore.persist({
      id:             job.id,
      idempotencyKey: job.idempotencyKey,
      userId:         job.userId,
      chatMessageId:  job.chatMessageId,
      sessionId:      job.sessionId,
      priority:       job.priority,
      payload:        { conversationHistory: job.conversationHistory, force: job.force },
      logicalStatus:  'QUEUED',
      currentStage:   'RAW_MESSAGE_PERSISTED',
    });
    if (!isNew) {
      logger.debug(
        { chatMessageId: job.chatMessageId, userId: job.userId },
        'IngestionQueue: duplicate enqueue skipped (idempotent)'
      );
      return false;
    }
    this.enqueueInMemory(job);
    return true;
  }

  /** Push an already-durable job into the in-memory scheduler. */
  private enqueueInMemory(job: IngestionJob): void {
    this.queues[job.priority].push(job);
    setImmediate(() => this.drain());
  }

  /**
   * Crash recovery: re-enqueue jobs the DB still shows as unfinished
   * (pending or interrupted 'processing'). Call once on server startup.
   */
  async recover(): Promise<number> {
    const rows = await ingestionJobStore.loadResumable();
    for (const r of rows) {
      const payload = (r.payload ?? {}) as {
        conversationHistory?: IngestionJobPayload['conversationHistory'];
        force?: boolean;
      };
      this.enqueueInMemory({
        id:             r.id,
        idempotencyKey: r.idempotency_key,
        userId:         r.user_id,
        chatMessageId:  r.chat_message_id ?? '',
        sessionId:      r.session_id ?? '',
        conversationHistory: payload.conversationHistory,
        force:          payload.force,
        priority:       (r.priority as JobPriority) ?? 'NORMAL',
        attempts:       r.attempts ?? 0,
        maxAttempts:    3,
        createdAt:      Date.now(),
      });
    }
    if (rows.length > 0) {
      logger.info({ recovered: rows.length }, 'IngestionQueue: recovered durable jobs on startup');
    }
    return rows.length;
  }

  /** Current total queue depth across all priorities. */
  depth(): number {
    return this.queues.HIGH.length + this.queues.NORMAL.length + this.queues.LOW.length;
  }

  /** Snapshot of queue health for observability endpoint. */
  stats() {
    return {
      depth:          this.depth(),
      active:         this.activeJobs,
      activeUsers:    this.activeUsers.size,
      totalEnqueued:  this.totalEnqueued,
      totalCompleted: this.totalCompleted,
      totalFailed:    this.totalFailed,
      byPriority: {
        HIGH:   this.queues.HIGH.length,
        NORMAL: this.queues.NORMAL.length,
        LOW:    this.queues.LOW.length,
      },
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private drain(): void {
    while (this.activeJobs < this.CONCURRENCY) {
      const job = this.dequeue();
      if (!job) return;
      this.activeJobs++;
      // Claim the user synchronously here (not in the async process()) so the
      // loop can't dequeue a second job for the same user before this one starts.
      this.activeUsers.add(job.userId);
      // Use setImmediate so the event loop can handle I/O between jobs
      setImmediate(() => this.process(job));
    }
  }

  private dequeue(): IngestionJob | null {
    // Strict priority: drain HIGH before NORMAL before LOW. Within a tier, pick
    // the first job whose user has no job in flight (per-user serialization),
    // preserving FIFO order for that user.
    for (const priority of ['HIGH', 'NORMAL', 'LOW'] as JobPriority[]) {
      const q = this.queues[priority];
      const idx = pickEligibleIndex(q, this.activeUsers);
      if (idx >= 0) {
        return q.splice(idx, 1)[0];
      }
    }
    return null;
  }

  private async process(job: IngestionJob): Promise<void> {
    job.attempts++;
    const attemptStart = Date.now();
    job.lastAttemptAt = attemptStart;
    void ingestionJobStore.markProcessing(job.id, job.attempts, `worker:${process.pid}`);

    // Open a pipeline run record so we can detect partial failures later
    const runId = await pipelineRunService.start({
      jobId:         job.id,
      userId:        job.userId,
      chatMessageId: job.chatMessageId,
      sessionId:     job.sessionId,
    });

    try {
      // Lazy import avoids a circular dependency at module load time
      const { conversationIngestionPipeline } = await import(
        '../conversationCentered/ingestionPipeline'
      );

      // Attribute all LLM/embedding spend in this job to the `ingestion`
      // operation so the cost dashboard separates ingestion from chat.
      await runWithMessageCost(
        { label: 'ingestion', userId: job.userId, messageId: job.chatMessageId },
        () =>
          conversationIngestionPipeline.ingestFromChatMessage(
            job.userId,
            job.chatMessageId,
            job.sessionId,
            job.conversationHistory,
            job.force
          )
      );

      this.totalCompleted++;
      // Success — mark COMPLETED (row retained briefly for diagnostics).
      void ingestionJobStore.markCompleted(job.id, 'COMPLETED');

      // Capture what this pipeline run produced. Non-blocking — errors are swallowed.
      // Queries by user_id + created_at > job start so we see only this run's outputs.
      if (runId) {
        const sinceIso = new Date(attemptStart).toISOString();
        void this.captureProductionSummary(runId, job.userId, sinceIso, attemptStart);
      }

      if (runId) await pipelineRunService.complete(runId, attemptStart);
      void import('../loreReadiness/loreReadinessService').then(({ loreReadinessService }) => {
        loreReadinessService.invalidateCache(job.userId);
      });
      logger.debug(
        { jobId: job.id, userId: job.userId, attempt: job.attempts },
        'IngestionQueue: job completed'
      );
    } catch (err) {
      job.lastError = String(err);
      const classified = classifyIngestionError(err);
      incMetric('ingestion_stage_failure');

      const canRetry =
        classified.retryable && job.attempts < job.maxAttempts;

      if (canRetry) {
        const delayMs = computeRetryDelayMs(job.attempts, classified.category);
        const nextRetryAt = new Date(Date.now() + delayMs);
        logger.warn(
          {
            jobId: job.id,
            userId: job.userId,
            attempt: job.attempts,
            delayMs,
            category: classified.category,
          },
          'IngestionQueue: job failed, will retry'
        );
        // Mark partial on retryable failures (run will be superseded by the next attempt's run)
        if (runId) await pipelineRunService.markPartial(runId, attemptStart, 'ingestFromChatMessage');
        // Back to retryable_failed durably so a crash during the backoff window still recovers it.
        void ingestionJobStore.markRetrying(job.id, job.attempts, classified.message, {
          category: classified.category,
          code: classified.code,
          failedStage: 'ingestFromChatMessage',
          nextRetryAt,
        });
        setTimeout(() => {
          this.queues[job.priority].push(job);
          this.drain();
        }, delayMs);
      } else {
        this.totalFailed++;
        logger.error(
          { jobId: job.id, userId: job.userId, attempts: job.attempts, err, category: classified.category },
          'IngestionQueue: job exhausted retries or permanent failure — dead-letter'
        );
        if (runId) await pipelineRunService.fail(runId, attemptStart, err, 'ingestFromChatMessage');
        await this.deadLetter(job, err);
        void ingestionJobStore.markDead(job.id, classified.message, {
          category: classified.category,
          code: classified.code,
          failedStage: 'ingestFromChatMessage',
        });
      }
    } finally {
      this.activeJobs--;
      this.activeUsers.delete(job.userId);
      this.drain();
    }
  }

  /**
   * Query what this pipeline run actually produced and record it as a step.
   * Called after successful ingestion — non-blocking, all errors swallowed.
   * Uses created_at > sinceIso to isolate this run's outputs.
   */
  private async captureProductionSummary(
    runId: string,
    userId: string,
    sinceIso: string,
    startedAt: number
  ): Promise<void> {
    try {
      const [kuRes, evRes, charRes, candRes, kuRes2] = await Promise.allSettled([
        supabaseAdmin.from('knowledge_units').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sinceIso),
        supabaseAdmin.from('conversation_events').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sinceIso),
        supabaseAdmin.from('characters').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sinceIso),
        supabaseAdmin.from('event_candidates').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sinceIso),
        supabaseAdmin.from('knowledge_units').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('updated_at', sinceIso),
      ]);

      const kuCount      = kuRes.status      === 'fulfilled' ? (kuRes.value.count      ?? 0) : -1;
      const evCount      = evRes.status      === 'fulfilled' ? (evRes.value.count      ?? 0) : -1;
      const charCount    = charRes.status    === 'fulfilled' ? (charRes.value.count    ?? 0) : -1;
      const candCount    = candRes.status    === 'fulfilled' ? (candRes.value.count    ?? 0) : -1;
      const kuTouched    = kuRes2.status     === 'fulfilled' ? (kuRes2.value.count     ?? 0) : -1;

      await pipelineRunService.recordStep(runId, {
        step: 'production_summary',
        success: true,
        duration_ms: Date.now() - startedAt,
        row_count: kuCount,
        metadata: {
          knowledge_units_created:   kuCount,
          knowledge_units_touched:   kuTouched,
          events_assembled:          evCount,
          entities_created:          charCount,
          event_candidates_created:  candCount,
        },
      });
    } catch {
      // Non-critical — production summary is observability only
    }
  }

  private async deadLetter(job: IngestionJob, err: unknown): Promise<void> {
    try {
      await supabaseAdmin.from('ingestion_dead_letter').insert({
        job_id:          job.id,
        user_id:         job.userId,
        chat_message_id: job.chatMessageId,
        attempts:        job.attempts,
        last_error:      String(err),
        payload: {
          userId:      job.userId,
          sessionId:   job.sessionId,
          priority:    job.priority,
          createdAt:   job.createdAt,
        },
      });
    } catch (dlErr) {
      // Dead-letter write failure is logged but cannot be recovered here.
      // The original job payload is logged below for manual recovery.
      logger.error(
        { dlErr, jobId: job.id, userId: job.userId, chatMessageId: job.chatMessageId },
        'IngestionQueue: dead-letter write also failed — job is lost'
      );
    }
  }
}

export const ingestionQueue = new IngestionQueue();

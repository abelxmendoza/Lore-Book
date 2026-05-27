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
import { supabaseAdmin } from '../supabaseClient';
import { pipelineRunService } from './pipelineRunService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobPriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface IngestionJobPayload {
  userId: string;
  chatMessageId: string;
  sessionId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface IngestionJob extends IngestionJobPayload {
  id: string;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  lastError?: string;
}

// ─── Queue ───────────────────────────────────────────────────────────────────

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
  private totalEnqueued = 0;
  private totalCompleted = 0;
  private totalFailed = 0;

  /**
   * Enqueue a new ingestion job.
   * Safe to call from the chat request handler — returns immediately.
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

    const job: IngestionJob = {
      ...payload,
      id:           randomUUID(),
      priority,
      attempts:     0,
      maxAttempts:  3,
      createdAt:    Date.now(),
    };

    this.queues[priority].push(job);
    this.totalEnqueued++;

    setImmediate(() => this.drain());

    return job.id;
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
      // Use setImmediate so the event loop can handle I/O between jobs
      setImmediate(() => this.process(job));
    }
  }

  private dequeue(): IngestionJob | null {
    // Strict priority: drain HIGH before NORMAL before LOW
    for (const priority of ['HIGH', 'NORMAL', 'LOW'] as JobPriority[]) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift()!;
      }
    }
    return null;
  }

  private async process(job: IngestionJob): Promise<void> {
    job.attempts++;
    const attemptStart = Date.now();
    job.lastAttemptAt = attemptStart;

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

      await conversationIngestionPipeline.ingestFromChatMessage(
        job.userId,
        job.chatMessageId,
        job.sessionId,
        job.conversationHistory
      );

      this.totalCompleted++;

      // Capture what this pipeline run produced. Non-blocking — errors are swallowed.
      // Queries by user_id + created_at > job start so we see only this run's outputs.
      if (runId) {
        const sinceIso = new Date(attemptStart).toISOString();
        void this.captureProductionSummary(runId, job.userId, sinceIso, attemptStart);
      }

      if (runId) await pipelineRunService.complete(runId, attemptStart);
      logger.debug(
        { jobId: job.id, userId: job.userId, attempt: job.attempts },
        'IngestionQueue: job completed'
      );
    } catch (err) {
      job.lastError = String(err);

      if (job.attempts < job.maxAttempts) {
        // Exponential backoff: attempt 1 → 1s, attempt 2 → 2s, attempt 3 → 4s
        const delayMs = Math.pow(2, job.attempts - 1) * 1_000;
        logger.warn(
          { jobId: job.id, userId: job.userId, attempt: job.attempts, delayMs },
          'IngestionQueue: job failed, will retry'
        );
        // Mark partial on retryable failures (run will be superseded by the next attempt's run)
        if (runId) await pipelineRunService.markPartial(runId, attemptStart, 'ingestFromChatMessage');
        setTimeout(() => {
          this.queues[job.priority].push(job);
          this.drain();
        }, delayMs);
      } else {
        this.totalFailed++;
        logger.error(
          { jobId: job.id, userId: job.userId, attempts: job.attempts, err },
          'IngestionQueue: job exhausted retries — sending to dead-letter'
        );
        if (runId) await pipelineRunService.fail(runId, attemptStart, err, 'ingestFromChatMessage');
        await this.deadLetter(job, err);
      }
    } finally {
      this.activeJobs--;
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

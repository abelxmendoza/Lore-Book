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
    job.lastAttemptAt = Date.now();

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
        await this.deadLetter(job, err);
      }
    } finally {
      this.activeJobs--;
      this.drain();
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

// =====================================================
// ASYNC INGESTION QUEUE
//
// Durable write-ahead log (ingestion_jobs) is the source of truth.
// In-memory scheduling is best-effort execution only.
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
  isNew: boolean;
  /**
   * QUEUED = durable WAL write succeeded.
   * DUPLICATE = already had a durable job.
   * DROPPED = circuit breaker.
   * RECOVERY_REQUIRED = durable write failed — never claim queued.
   */
  status: 'QUEUED' | 'DUPLICATE' | 'DROPPED' | 'RECOVERY_REQUIRED';
  error?: string;
};

interface IngestionJob extends IngestionJobPayload {
  id: string;
  idempotencyKey: string;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  lastError?: string;
  leaseToken?: string;
  attemptVersion?: number;
}

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
    HIGH: [],
    NORMAL: [],
    LOW: [],
  };

  private readonly CONCURRENCY = 2;
  private readonly MAX_QUEUE_DEPTH = 1000;

  private activeJobs = 0;
  private readonly activeUsers = new Set<string>();
  private totalEnqueued = 0;
  private totalCompleted = 0;
  private totalFailed = 0;

  /**
   * Legacy fire-and-forget enqueue. Prefer enqueueDurable for chat path.
   * If durable write fails, marks RECOVERY_REQUIRED and does not claim queued.
   */
  enqueue(payload: IngestionJobPayload, priority: JobPriority = 'NORMAL'): string {
    const depth = this.depth();
    if (depth >= this.MAX_QUEUE_DEPTH) {
      logger.warn(
        { depth, userId: payload.userId },
        'IngestionQueue: circuit breaker tripped — queue full, dropping job',
      );
      void ingestionJobStore.markMessageRecoveryRequired(
        payload.userId,
        payload.chatMessageId,
        'queue_circuit_breaker_full',
      );
      return '';
    }

    const job = this.buildJob(payload, priority);
    this.totalEnqueued++;
    void this.persistThenQueue(job).then((result) => {
      if (result === 'durable_failed') {
        void ingestionJobStore.markMessageRecoveryRequired(
          payload.userId,
          payload.chatMessageId,
          'ingestion_jobs_write_failed',
        );
      }
    });
    return job.id;
  }

  /**
   * Await write-ahead persist. Truthful status — never reports QUEUED on WAL failure.
   */
  async enqueueDurable(
    payload: IngestionJobPayload,
    priority: JobPriority = 'NORMAL',
  ): Promise<EnqueueResult> {
    const depth = this.depth();
    if (depth >= this.MAX_QUEUE_DEPTH) {
      logger.warn(
        { depth, userId: payload.userId },
        'IngestionQueue: circuit breaker tripped — queue full',
      );
      await ingestionJobStore.markMessageRecoveryRequired(
        payload.userId,
        payload.chatMessageId,
        'queue_circuit_breaker_full',
      );
      return { jobId: '', isNew: false, status: 'DROPPED', error: 'queue_full' };
    }

    const job = this.buildJob(payload, priority);
    this.totalEnqueued++;
    const result = await this.persistThenQueue(job);

    if (result === 'durable_failed') {
      await ingestionJobStore.markMessageRecoveryRequired(
        payload.userId,
        payload.chatMessageId,
        'ingestion_jobs_write_failed',
      );
      // Best-effort in-memory only — NOT source of truth.
      this.enqueueInMemory(job);
      logger.error(
        { chatMessageId: payload.chatMessageId, userId: payload.userId, jobId: job.id },
        'IngestionQueue: durable write failed — RECOVERY_REQUIRED',
      );
      return {
        jobId: job.id,
        isNew: false,
        status: 'RECOVERY_REQUIRED',
        error: 'durable_write_failed',
      };
    }

    if (result === 'duplicate') {
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

  private async persistThenQueue(
    job: IngestionJob,
  ): Promise<'new' | 'duplicate' | 'durable_failed'> {
    const persistResult = await ingestionJobStore.persist({
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      userId: job.userId,
      chatMessageId: job.chatMessageId,
      sessionId: job.sessionId,
      priority: job.priority,
      payload: {
        conversationHistory: job.conversationHistory?.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.slice(0, 8000) : '',
        })),
        force: job.force,
      },
      logicalStatus: 'QUEUED',
      currentStage: 'RAW_MESSAGE_PERSISTED',
    });

    if (!persistResult.ok) {
      return 'durable_failed';
    }
    if (!persistResult.isNew) {
      logger.debug(
        { chatMessageId: job.chatMessageId, userId: job.userId },
        'IngestionQueue: duplicate enqueue skipped (idempotent)',
      );
      return 'duplicate';
    }
    if (persistResult.id && persistResult.id !== job.id) {
      job.id = persistResult.id;
    }
    this.enqueueInMemory(job);
    return 'new';
  }

  private enqueueInMemory(job: IngestionJob): void {
    this.queues[job.priority].push(job);
    setImmediate(() => this.drain());
  }

  async recover(): Promise<number> {
    const rows = await ingestionJobStore.loadResumable();
    for (const r of rows) {
      const payload = (r.payload ?? {}) as {
        conversationHistory?: IngestionJobPayload['conversationHistory'];
        force?: boolean;
      };
      this.enqueueInMemory({
        id: r.id,
        idempotencyKey: r.idempotency_key,
        userId: r.user_id,
        chatMessageId: r.chat_message_id ?? '',
        sessionId: r.session_id ?? '',
        conversationHistory: payload.conversationHistory,
        force: payload.force,
        priority: (r.priority as JobPriority) ?? 'NORMAL',
        attempts: r.attempts ?? 0,
        maxAttempts: 5,
        createdAt: Date.now(),
      });
    }
    if (rows.length > 0) {
      logger.info({ recovered: rows.length }, 'IngestionQueue: recovered durable jobs on startup');
    }
    return rows.length;
  }

  depth(): number {
    return this.queues.HIGH.length + this.queues.NORMAL.length + this.queues.LOW.length;
  }

  stats() {
    return {
      depth: this.depth(),
      active: this.activeJobs,
      activeUsers: this.activeUsers.size,
      totalEnqueued: this.totalEnqueued,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      byPriority: {
        HIGH: this.queues.HIGH.length,
        NORMAL: this.queues.NORMAL.length,
        LOW: this.queues.LOW.length,
      },
    };
  }

  private drain(): void {
    while (this.activeJobs < this.CONCURRENCY) {
      const job = this.dequeue();
      if (!job) return;
      this.activeJobs++;
      this.activeUsers.add(job.userId);
      setImmediate(() => this.process(job));
    }
  }

  private dequeue(): IngestionJob | null {
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

    try {
      const { maybeInjectFault } = await import('../chat/durabilityFaultInjection');
      await maybeInjectFault('before_worker_claim', { jobId: job.id, userId: job.userId });
    } catch {
      /* optional module */
    }

    const claim = await ingestionJobStore.claim(job.id, job.attempts, `worker:${process.pid}`);
    if (!claim.claimed) {
      logger.warn({ jobId: job.id }, 'IngestionQueue: claim lost — another worker holds lease');
      this.activeJobs--;
      this.activeUsers.delete(job.userId);
      this.drain();
      return;
    }
    const fence = { leaseToken: claim.leaseToken, attemptVersion: claim.attemptVersion };
    job.leaseToken = claim.leaseToken;
    job.attemptVersion = claim.attemptVersion;

    try {
      const { maybeInjectFault } = await import('../chat/durabilityFaultInjection');
      await maybeInjectFault('after_worker_claim', { jobId: job.id, userId: job.userId });
    } catch {
      /* optional */
    }

    const runId = await pipelineRunService.start({
      jobId: job.id,
      userId: job.userId,
      chatMessageId: job.chatMessageId,
      sessionId: job.sessionId,
    });

    try {
      const { conversationIngestionPipeline } = await import(
        '../conversationCentered/ingestionPipeline'
      );

      try {
        const { getProviderPressure, shouldRunOptionalEnrichment } = await import(
          '../chat/providerPressurePolicy'
        );
        const pressure = getProviderPressure();
        if (!shouldRunOptionalEnrichment(pressure)) {
          logger.info(
            { jobId: job.id, pressure },
            'IngestionQueue: provider pressure — core path only',
          );
        }
      } catch {
        /* optional */
      }

      await runWithMessageCost(
        { label: 'ingestion', userId: job.userId, messageId: job.chatMessageId },
        () =>
          conversationIngestionPipeline.ingestFromChatMessage(
            job.userId,
            job.chatMessageId,
            job.sessionId,
            job.conversationHistory,
            job.force,
          ),
      );

      // ── MEMORY_QUALITY stage (durable, observable, not fire-and-forget) ──
      // Optional enrichment under provider pressure may SKIP but remains recorded.
      let mqStatus: string = 'PENDING';
      try {
        await ingestionJobStore.recordStage(
          job.id,
          'MEMORY_QUALITY',
          undefined,
          fence,
        );

        const pressureMod = await import('../chat/providerPressurePolicy').catch(() => null);
        const getProviderPressure = pressureMod?.getProviderPressure ?? (() => 'normal' as const);
        const shouldRunOptionalEnrichment = pressureMod?.shouldRunOptionalEnrichment ?? (() => true);

        if (!shouldRunOptionalEnrichment(getProviderPressure())) {
          mqStatus = 'SKIPPED';
          logger.info(
            { jobId: job.id, pressure: getProviderPressure() },
            'Memory Quality skipped under provider pressure',
          );
        } else {
          // Load message text for meaning extraction
          const { data: msgRow } = await supabaseAdmin
            .from('chat_messages')
            .select('content, role')
            .eq('id', job.chatMessageId)
            .eq('user_id', job.userId)
            .maybeSingle();

          if (!msgRow?.content || msgRow.role !== 'user') {
            mqStatus = 'SKIPPED';
          } else {
            const { runMemoryQualityForMessage } = await import(
              '../memoryQuality/memoryQualityIntegrationService'
            );
            const mq = await runMemoryQualityForMessage(
              job.userId,
              msgRow.content,
              job.chatMessageId,
              { jobId: job.id },
            );
            mqStatus = mq.status;
            if (runId) {
              await pipelineRunService.recordStep(runId, {
                step: 'MEMORY_QUALITY',
                success: mq.status === 'COMPLETED' || mq.status === 'SKIPPED',
                duration_ms: Date.now() - attemptStart,
                row_count: mq.artifactIds.length,
                metadata: {
                  status: mq.status,
                  created: mq.created,
                  reused: mq.reused,
                },
              });
            }
            // Retryable MQ failure does not fail the whole job (raw message durable)
            // but is recorded for recovery tooling.
            if (mq.status === 'RETRYABLE_FAILED') {
              logger.warn(
                { jobId: job.id, err: mq.error },
                'Memory Quality retryable failure — core ingestion still complete',
              );
            }
          }
        }
      } catch (mqErr) {
        mqStatus = 'RETRYABLE_FAILED';
        logger.warn({ err: mqErr, jobId: job.id }, 'Memory Quality stage error (non-fatal to core)');
      }
      try {
        await supabaseAdmin
          .from('ingestion_jobs')
          .update({
            memory_quality_status: mqStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      } catch {
        /* column may not exist pre-migration */
      }

      try {
        const { maybeInjectFault } = await import('../chat/durabilityFaultInjection');
        await maybeInjectFault('before_job_completion', { jobId: job.id, userId: job.userId });
      } catch {
        /* optional */
      }

      this.totalCompleted++;
      const completed = await ingestionJobStore.markCompleted(job.id, 'COMPLETED', fence);
      if (!completed) {
        logger.warn(
          { jobId: job.id },
          'IngestionQueue: stale worker blocked from completing reclaimed job',
        );
        return;
      }

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
        'IngestionQueue: job completed',
      );
    } catch (err) {
      job.lastError = String(err);
      const classified = classifyIngestionError(err);
      incMetric('ingestion_stage_failure');

      if (classified.category === 'rate_limit' || classified.category === 'quota_exhausted') {
        void import('../chat/providerPressurePolicy')
          .then(({ recordProviderFailure }) => recordProviderFailure(classified.category))
          .catch(() => undefined);
      }

      const canRetry = classified.retryable && job.attempts < job.maxAttempts;

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
          'IngestionQueue: job failed, will retry',
        );
        if (runId) await pipelineRunService.markPartial(runId, attemptStart, 'ingestFromChatMessage');
        void ingestionJobStore.markRetrying(job.id, job.attempts, classified.message, {
          category: classified.category,
          code: classified.code,
          failedStage: 'ingestFromChatMessage',
          nextRetryAt,
          leaseToken: fence.leaseToken,
          attemptVersion: fence.attemptVersion,
        });
        setTimeout(() => {
          this.queues[job.priority].push(job);
          this.drain();
        }, delayMs);
      } else {
        this.totalFailed++;
        logger.error(
          {
            jobId: job.id,
            userId: job.userId,
            attempts: job.attempts,
            err,
            category: classified.category,
          },
          'IngestionQueue: job exhausted retries — dead-letter',
        );
        if (runId) await pipelineRunService.fail(runId, attemptStart, err, 'ingestFromChatMessage');
        await this.deadLetter(job, err);
        void ingestionJobStore.markDead(job.id, classified.message, {
          category: classified.category,
          code: classified.code,
          failedStage: 'ingestFromChatMessage',
          leaseToken: fence.leaseToken,
          attemptVersion: fence.attemptVersion,
        });
      }
    } finally {
      this.activeJobs--;
      this.activeUsers.delete(job.userId);
      this.drain();
    }
  }

  private async captureProductionSummary(
    runId: string,
    userId: string,
    sinceIso: string,
    startedAt: number,
  ): Promise<void> {
    try {
      const [kuRes, evRes, charRes, candRes, kuRes2] = await Promise.allSettled([
        supabaseAdmin
          .from('knowledge_units')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', sinceIso),
        supabaseAdmin
          .from('conversation_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', sinceIso),
        supabaseAdmin
          .from('characters')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', sinceIso),
        supabaseAdmin
          .from('event_candidates')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', sinceIso),
        supabaseAdmin
          .from('knowledge_units')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('updated_at', sinceIso),
      ]);

      const kuCount = kuRes.status === 'fulfilled' ? (kuRes.value.count ?? 0) : -1;
      const evCount = evRes.status === 'fulfilled' ? (evRes.value.count ?? 0) : -1;
      const charCount = charRes.status === 'fulfilled' ? (charRes.value.count ?? 0) : -1;
      const candCount = candRes.status === 'fulfilled' ? (candRes.value.count ?? 0) : -1;
      const kuTouched = kuRes2.status === 'fulfilled' ? (kuRes2.value.count ?? 0) : -1;

      await pipelineRunService.recordStep(runId, {
        step: 'production_summary',
        success: true,
        duration_ms: Date.now() - startedAt,
        row_count: kuCount,
        metadata: {
          knowledge_units_created: kuCount,
          knowledge_units_touched: kuTouched,
          events_assembled: evCount,
          entities_created: charCount,
          event_candidates_created: candCount,
        },
      });
    } catch {
      /* observability only */
    }
  }

  private async deadLetter(job: IngestionJob, err: unknown): Promise<void> {
    try {
      await supabaseAdmin.from('ingestion_dead_letter').insert({
        job_id: job.id,
        user_id: job.userId,
        chat_message_id: job.chatMessageId,
        attempts: job.attempts,
        last_error: String(err).slice(0, 2000),
        payload: {
          userId: job.userId,
          sessionId: job.sessionId,
          priority: job.priority,
          createdAt: job.createdAt,
        },
      });
    } catch (dlErr) {
      logger.error(
        { dlErr, jobId: job.id, userId: job.userId, chatMessageId: job.chatMessageId },
        'IngestionQueue: dead-letter write also failed',
      );
    }
  }
}

export const ingestionQueue = new IngestionQueue();

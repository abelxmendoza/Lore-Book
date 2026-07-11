/**
 * Recovery tooling for stranded autobiographical messages.
 *
 * Scans for:
 *   - persisted user messages with no ingestion job
 *   - stale PROCESSING jobs
 *   - PARTIAL / RETRYABLE_FAILED jobs
 *
 * Dry-run by default. Never exposes cross-user repair to ordinary clients.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { ingestionJobStore } from './ingestionJobStore';
import { ingestionQueue } from './ingestionQueue';
import { normalizeJobStatus, isActiveStatus } from './ingestionJobStates';

export type RecoveryScanResult = {
  dryRun: boolean;
  messagesWithoutJob: Array<{ messageId: string; sessionId: string | null; createdAt: string }>;
  staleProcessingJobs: Array<{ jobId: string; messageId: string | null; lockedAt: string | null }>;
  retryableFailedJobs: Array<{ jobId: string; messageId: string | null; status: string }>;
  actions: Array<{ action: string; targetId: string; applied: boolean }>;
  summary: {
    messagesWithoutJob: number;
    staleProcessing: number;
    retryableFailed: number;
    enqueued: number;
    reclaimed: number;
  };
};

export type RecoveryOptions = {
  userId?: string;
  dryRun?: boolean;
  limit?: number;
  staleAfterMs?: number;
  messageId?: string;
};

class IngestionRecoveryService {
  async scan(opts: RecoveryOptions = {}): Promise<RecoveryScanResult> {
    const dryRun = opts.dryRun !== false;
    const limit = Math.min(opts.limit ?? 50, 200);
    const staleAfterMs = opts.staleAfterMs ?? 10 * 60 * 1000;
    const actions: RecoveryScanResult['actions'] = [];

    const messagesWithoutJob = await this.findMessagesWithoutJob(opts.userId, limit, opts.messageId);
    const staleProcessingJobs = await this.findStaleProcessing(opts.userId, limit, staleAfterMs);
    const retryableFailedJobs = await this.findRetryableFailed(opts.userId, limit);

    let enqueued = 0;
    let reclaimed = 0;

    if (!dryRun) {
      reclaimed = await ingestionJobStore.reclaimStaleLocks(staleAfterMs, limit);
      if (reclaimed > 0) {
        actions.push({ action: 'reclaim_stale_locks', targetId: `count:${reclaimed}`, applied: true });
        // Re-load into in-memory queue after reclaim
        await ingestionQueue.recover();
      }

      for (const m of messagesWithoutJob) {
        if (!opts.userId && !m.messageId) continue;
        const userId = opts.userId ?? (await this.lookupMessageUser(m.messageId));
        if (!userId) continue;
        const result = await ingestionQueue.enqueueDurable(
          {
            userId,
            chatMessageId: m.messageId,
            sessionId: m.sessionId ?? '',
            conversationHistory: [],
          },
          'NORMAL',
        );
        const applied = result.status === 'QUEUED' || result.status === 'DUPLICATE';
        if (result.status === 'QUEUED') enqueued++;
        actions.push({
          action: 'enqueue_missing_job',
          targetId: m.messageId,
          applied,
        });
      }

      for (const j of retryableFailedJobs) {
        // Re-enqueue by force=false uses same idempotency key; if job is still pending it dedupes.
        // Force reprocess only when explicitly targeting a message.
        if (opts.messageId && j.messageId === opts.messageId) {
          const userId = opts.userId ?? (await this.lookupJobUser(j.jobId));
          if (!userId || !j.messageId) continue;
          const result = await ingestionQueue.enqueueDurable(
            {
              userId,
              chatMessageId: j.messageId,
              sessionId: '',
              conversationHistory: [],
              force: true,
            },
            'HIGH',
          );
          if (result.status === 'QUEUED') enqueued++;
          actions.push({ action: 'retry_failed_job', targetId: j.jobId, applied: result.status === 'QUEUED' });
        }
      }
    }

    return {
      dryRun,
      messagesWithoutJob,
      staleProcessingJobs,
      retryableFailedJobs,
      actions,
      summary: {
        messagesWithoutJob: messagesWithoutJob.length,
        staleProcessing: staleProcessingJobs.length,
        retryableFailed: retryableFailedJobs.length,
        enqueued,
        reclaimed,
      },
    };
  }

  async retryMessage(userId: string, messageId: string, force = true): Promise<{ jobId: string; status: string }> {
    const { data: msg } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id, user_id, role')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!msg?.id || msg.role !== 'user') {
      throw new Error('User message not found for this account');
    }

    const result = await ingestionQueue.enqueueDurable(
      {
        userId,
        chatMessageId: messageId,
        sessionId: msg.session_id ?? '',
        conversationHistory: [],
        force,
      },
      'HIGH',
    );

    return { jobId: result.jobId, status: result.status };
  }

  async getMessageDurability(userId: string, messageId: string) {
    const { data: msg } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id, role, content, created_at, client_idempotency_key, metadata')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!msg) {
      return null;
    }

    const job = await ingestionJobStore.findByChatMessageId(messageId, userId);

    let pipelineRun: Record<string, unknown> | null = null;
    try {
      const { data: run } = await supabaseAdmin
        .from('pipeline_runs')
        .select('id, status, started_at, completed_at, completed_steps, failed_at_step, error, step_results')
        .eq('user_id', userId)
        .eq('chat_message_id', messageId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      pipelineRun = run ?? null;
    } catch {
      /* optional */
    }

    // Assistant messages in same session after this user message
    let assistant: { id: string; created_at: string } | null = null;
    if (msg.session_id && msg.role === 'user') {
      const { data: asst } = await supabaseAdmin
        .from('chat_messages')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('session_id', msg.session_id)
        .eq('role', 'assistant')
        .gt('created_at', msg.created_at)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      assistant = asst ?? null;
    }

    return {
      userMessage: {
        id: msg.id,
        persisted: true,
        sessionId: msg.session_id,
        role: msg.role,
        createdAt: msg.created_at,
        idempotencyKey: msg.client_idempotency_key,
        contentPreview: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
      },
      assistantResponse: assistant
        ? { status: 'completed' as const, messageId: assistant.id }
        : { status: 'failed' as const },
      ingestion: job
        ? {
            jobId: job.id,
            status: job.status,
            currentStage: job.currentStage,
            completedStages: job.completedStages,
            failedStage: job.failedStage,
            retryable: job.retryable,
            nextRetryAt: job.nextRetryAt,
            attemptCount: job.attemptCount,
            lastErrorCode: job.lastErrorCode,
            lastErrorCategory: job.lastErrorCategory,
          }
        : {
            jobId: undefined,
            status: 'NOT_SCHEDULED' as const,
          },
      pipelineRun,
      willRetry:
        job != null &&
        (job.retryable === true || isActiveStatus(normalizeJobStatus(job.status))) &&
        job.status !== 'COMPLETED' &&
        job.status !== 'PERMANENT_FAILED',
    };
  }

  private async findMessagesWithoutJob(
    userId: string | undefined,
    limit: number,
    messageId?: string,
  ): Promise<RecoveryScanResult['messagesWithoutJob']> {
    try {
      // Recent user messages (bounded window)
      let q = supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, created_at, user_id, metadata')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(limit * 2);
      if (userId) q = q.eq('user_id', userId);
      if (messageId) q = q.eq('id', messageId);
      const { data: messages, error } = await q;
      if (error || !messages?.length) return [];

      const out: RecoveryScanResult['messagesWithoutJob'] = [];
      for (const m of messages) {
        if (out.length >= limit) break;
        const meta = (m.metadata ?? {}) as { ingestion_recovery?: { status?: string } };
        const markedRecovery = meta.ingestion_recovery?.status === 'RECOVERY_REQUIRED';
        const job = await ingestionJobStore.findByChatMessageId(m.id, m.user_id);
        if (!job || markedRecovery) {
          if (job && !markedRecovery) continue;
          // Also check pipeline_runs as a secondary signal of prior ingestion
          const { count } = await supabaseAdmin
            .from('pipeline_runs')
            .select('*', { count: 'exact', head: true })
            .eq('chat_message_id', m.id)
            .eq('user_id', m.user_id);
          if ((count ?? 0) === 0 || markedRecovery) {
            out.push({
              messageId: m.id,
              sessionId: m.session_id,
              createdAt: m.created_at,
            });
          }
        }
      }
      return out;
    } catch (err) {
      logger.warn({ err }, 'ingestionRecovery: findMessagesWithoutJob failed');
      return [];
    }
  }

  private async findStaleProcessing(
    userId: string | undefined,
    limit: number,
    staleAfterMs: number,
  ): Promise<RecoveryScanResult['staleProcessingJobs']> {
    const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
    try {
      let q = supabaseAdmin
        .from('ingestion_jobs')
        .select('id, chat_message_id, locked_at, status, logical_status')
        .in('status', ['pending', 'processing'])
        .not('locked_at', 'is', null)
        .lt('locked_at', cutoff)
        .limit(limit);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error || !data) return [];
      return data.map((r) => ({
        jobId: r.id,
        messageId: r.chat_message_id,
        lockedAt: r.locked_at,
      }));
    } catch {
      return [];
    }
  }

  private async findRetryableFailed(
    userId: string | undefined,
    limit: number,
  ): Promise<RecoveryScanResult['retryableFailedJobs']> {
    try {
      let q = supabaseAdmin
        .from('ingestion_jobs')
        .select('id, chat_message_id, status, logical_status')
        .or('logical_status.eq.RETRYABLE_FAILED,logical_status.eq.PARTIAL,status.eq.pending')
        .limit(limit);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error || !data) return [];
      return data.map((r) => ({
        jobId: r.id,
        messageId: r.chat_message_id,
        status: r.logical_status ?? r.status,
      }));
    } catch {
      return [];
    }
  }

  private async lookupMessageUser(messageId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from('chat_messages').select('user_id').eq('id', messageId).maybeSingle();
    return data?.user_id ?? null;
  }

  private async lookupJobUser(jobId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from('ingestion_jobs').select('user_id').eq('id', jobId).maybeSingle();
    return data?.user_id ?? null;
  }
}

export const ingestionRecoveryService = new IngestionRecoveryService();

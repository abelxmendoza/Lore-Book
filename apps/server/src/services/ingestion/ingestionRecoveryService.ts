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
import { evaluateLifeLogEligibility } from '../events/lifeLogEligibilityPolicy';

const ARTIFACT_GAP_RECOVERY_VERSION = 'v1';
const PROVIDER_RECOVERY_VERSION = 'v1';
const PROVIDER_RECOVERY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function chunksOf<T>(items: T[], size = 100): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export type RecoveryScanResult = {
  dryRun: boolean;
  messagesWithoutJob: Array<{ messageId: string; sessionId: string | null; createdAt: string }>;
  staleProcessingJobs: Array<{ jobId: string; messageId: string | null; lockedAt: string | null }>;
  retryableFailedJobs: Array<{ jobId: string; messageId: string | null; status: string }>;
  artifactGaps: Array<{ messageId: string; sessionId: string | null; createdAt: string }>;
  providerExhaustedJobs: Array<{ jobId: string; messageId: string; sessionId: string | null; failedAt: string }>;
  actions: Array<{ action: string; targetId: string; applied: boolean }>;
  summary: {
    messagesWithoutJob: number;
    staleProcessing: number;
    retryableFailed: number;
    artifactGaps: number;
    artifactGapsQueued: number;
    providerExhausted: number;
    providerRecoveryQueued: number;
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
    const artifactGaps = opts.userId
      ? await this.findArtifactGaps(opts.userId, limit, opts.messageId)
      : [];
    const providerExhaustedJobs = opts.userId
      ? await this.findProviderExhaustedJobs(opts.userId, limit, opts.messageId)
      : [];

    let enqueued = 0;
    let reclaimed = 0;
    let artifactGapsQueued = 0;
    let providerRecoveryQueued = 0;

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

      for (const gap of artifactGaps) {
        const applied = await this.reprocessArtifactGap(opts.userId!, gap);
        if (applied) {
          enqueued++;
          artifactGapsQueued++;
        }
        actions.push({ action: 'reprocess_artifact_gap', targetId: gap.messageId, applied });
      }

      for (const job of providerExhaustedJobs) {
        const applied = await this.reprocessProviderExhaustedJob(opts.userId!, job);
        if (applied) {
          enqueued++;
          providerRecoveryQueued++;
        }
        actions.push({ action: 'retry_provider_exhausted_job', targetId: job.jobId, applied });
      }
    }

    return {
      dryRun,
      messagesWithoutJob,
      staleProcessingJobs,
      retryableFailedJobs,
      artifactGaps,
      providerExhaustedJobs,
      actions,
      summary: {
        messagesWithoutJob: messagesWithoutJob.length,
        staleProcessing: staleProcessingJobs.length,
        retryableFailed: retryableFailedJobs.length,
        artifactGaps: artifactGaps.length,
        artifactGapsQueued,
        providerExhausted: providerExhaustedJobs.length,
        providerRecoveryQueued,
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

  /**
   * Find autobiographical messages that completed the raw-to-conversation copy
   * but produced no active extracted units. Commands and small talk are
   * intentionally excluded so recovery cannot become an infinite retry loop.
   */
  private async findArtifactGaps(
    userId: string,
    limit: number,
    messageId?: string,
  ): Promise<RecoveryScanResult['artifactGaps']> {
    try {
      let query = supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, content, created_at, metadata')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit * 10, 1000));
      if (messageId) query = query.eq('id', messageId);
      const { data: messages, error } = await query;
      if (error || !messages?.length) return [];

      const candidates = messages.filter((message) => {
        const metadata = (message.metadata ?? {}) as Record<string, any>;
        const priorRecovery = metadata.life_log_recovery as { version?: string; status?: string } | undefined;
        if (priorRecovery?.version === ARTIFACT_GAP_RECOVERY_VERSION && priorRecovery.status === 'queued') return false;
        return evaluateLifeLogEligibility({ text: String(message.content ?? '') }).eligible;
      });
      if (candidates.length === 0) return [];

      const messageIds = candidates.map((message) => message.id as string);
      const derivedRows: Array<{ id: string; metadata: Record<string, unknown> | null }> = [];
      for (const ids of chunksOf(messageIds)) {
        const { data, error: derivedError } = await supabaseAdmin
          .from('conversation_messages')
          .select('id, metadata')
          .eq('user_id', userId)
          .in('metadata->>chat_message_id', ids);
        if (derivedError) return [];
        derivedRows.push(...((data ?? []) as typeof derivedRows));
      }
      if (derivedRows.length === 0) return [];

      const activeDerivedRows = derivedRows.filter((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return !metadata.superseded_at;
      });
      if (activeDerivedRows.length === 0) return [];

      const derivedIds = activeDerivedRows.map((row) => row.id as string);
      const utterances: Array<{ id: string; message_id: string }> = [];
      for (const ids of chunksOf(derivedIds)) {
        const { data } = await supabaseAdmin
          .from('utterances')
          .select('id, message_id')
          .eq('user_id', userId)
          .in('message_id', ids);
        utterances.push(...((data ?? []) as typeof utterances));
      }
      const utteranceIds = (utterances ?? []).map((row) => row.id as string);
      const units: Array<{ utterance_id: string; superseded_at: string | null }> = [];
      for (const ids of chunksOf(utteranceIds)) {
        const { data } = await supabaseAdmin
          .from('extracted_units')
          .select('utterance_id, superseded_at')
          .eq('user_id', userId)
          .in('utterance_id', ids)
          .is('superseded_at', null);
        units.push(...((data ?? []) as typeof units));
      }

      const messageByDerivedId = new Map<string, string>();
      for (const row of activeDerivedRows) {
        const sourceId = (row.metadata as Record<string, unknown> | null)?.chat_message_id;
        if (typeof sourceId === 'string') messageByDerivedId.set(row.id, sourceId);
      }
      const activeUnitMessages = new Set<string>();
      const derivedByUtterance = new Map(utterances.map((row) => [row.id as string, row.message_id as string]));
      for (const unit of units) {
        const derivedId = derivedByUtterance.get(unit.utterance_id as string);
        const sourceId = derivedId ? messageByDerivedId.get(derivedId) : undefined;
        if (sourceId) activeUnitMessages.add(sourceId);
      }

      const messagesWithDerivedRows = new Set(messageByDerivedId.values());
      return candidates
        .filter((message) => messagesWithDerivedRows.has(message.id) && !activeUnitMessages.has(message.id))
        .slice(0, limit)
        .map((message) => ({
          messageId: message.id,
          sessionId: message.session_id ?? null,
          createdAt: message.created_at,
        }));
    } catch (err) {
      logger.warn({ err, userId }, 'ingestionRecovery: artifact-gap scan failed');
      return [];
    }
  }

  /** Revisit stories that were durably saved but exhausted all provider retries. */
  private async findProviderExhaustedJobs(
    userId: string,
    limit: number,
    messageId?: string,
  ): Promise<RecoveryScanResult['providerExhaustedJobs']> {
    try {
      let query = supabaseAdmin
        .from('ingestion_jobs')
        .select('id, chat_message_id, session_id, updated_at, last_error_category')
        .eq('user_id', userId)
        .eq('logical_status', 'PERMANENT_FAILED')
        .in('last_error_category', ['quota_exhausted', 'rate_limit'])
        .order('updated_at', { ascending: false })
        .limit(limit * 2);
      if (messageId) query = query.eq('chat_message_id', messageId);
      const { data: jobs, error } = await query;
      if (error || !jobs?.length) return [];

      const results: RecoveryScanResult['providerExhaustedJobs'] = [];
      const seenMessages = new Set<string>();
      for (const job of jobs) {
        const sourceId = job.chat_message_id as string | null;
        if (!sourceId || seenMessages.has(sourceId)) continue;
        seenMessages.add(sourceId);

        // An older dead attempt is irrelevant once a newer attempt exists.
        const latest = await ingestionJobStore.findByChatMessageId(sourceId, userId);
        if (!latest || latest.id !== job.id) continue;

        const { data: message } = await supabaseAdmin
          .from('chat_messages')
          .select('metadata')
          .eq('id', sourceId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!message) continue;
        const recovery = ((message.metadata ?? {}) as Record<string, any>).provider_recovery as
          | { version?: string; attempted_at?: string }
          | undefined;
        const attemptedAt = recovery?.attempted_at ? Date.parse(recovery.attempted_at) : 0;
        if (
          recovery?.version === PROVIDER_RECOVERY_VERSION &&
          Number.isFinite(attemptedAt) &&
          Date.now() - attemptedAt < PROVIDER_RECOVERY_COOLDOWN_MS
        ) {
          continue;
        }
        results.push({
          jobId: job.id,
          messageId: sourceId,
          sessionId: job.session_id ?? null,
          failedAt: job.updated_at,
        });
        if (results.length >= limit) break;
      }
      return results;
    } catch (err) {
      logger.warn({ err, userId }, 'ingestionRecovery: provider-exhaustion scan failed');
      return [];
    }
  }

  private async reprocessProviderExhaustedJob(
    userId: string,
    job: RecoveryScanResult['providerExhaustedJobs'][number],
  ): Promise<boolean> {
    const { data: message } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', job.messageId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!message) return false;

    const result = await ingestionQueue.enqueueDurable(
      {
        userId,
        chatMessageId: job.messageId,
        sessionId: job.sessionId ?? '',
        conversationHistory: [],
        force: true,
      },
      'LOW',
    );
    const queued = result.status === 'QUEUED';
    await supabaseAdmin
      .from('chat_messages')
      .update({
        metadata: {
          ...((message.metadata ?? {}) as Record<string, unknown>),
          provider_recovery: {
            version: PROVIDER_RECOVERY_VERSION,
            status: queued ? 'queued' : 'failed',
            attempted_at: new Date().toISOString(),
            prior_job_id: job.jobId,
          },
        },
      })
      .eq('id', job.messageId)
      .eq('user_id', userId);
    return queued;
  }

  private async reprocessArtifactGap(
    userId: string,
    gap: RecoveryScanResult['artifactGaps'][number],
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const { data: source } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', gap.messageId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!source) return false;

    const { data: derivedRows } = await supabaseAdmin
      .from('conversation_messages')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('metadata->>chat_message_id', gap.messageId);
    const supersededRows: Array<{ id: string; metadata: Record<string, unknown> }> = [];
    for (const row of derivedRows ?? []) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (metadata.superseded_at) continue;
      supersededRows.push({ id: row.id, metadata });
      await supabaseAdmin
        .from('conversation_messages')
        .update({ metadata: { ...metadata, superseded_at: now, superseded_reason: 'artifact_gap_recovery' } })
        .eq('id', row.id)
        .eq('user_id', userId);
    }

    const result = await ingestionQueue.enqueueDurable(
      {
        userId,
        chatMessageId: gap.messageId,
        sessionId: gap.sessionId ?? '',
        conversationHistory: [],
        force: true,
      },
      'LOW',
    );
    const queued = result.status === 'QUEUED';
    if (!queued) {
      // The raw source remains canonical. Restore the prior derived rows so a
      // transient queue/WAL failure cannot turn a repair attempt into data loss.
      for (const row of supersededRows) {
        await supabaseAdmin
          .from('conversation_messages')
          .update({ metadata: row.metadata })
          .eq('id', row.id)
          .eq('user_id', userId);
      }
    }

    await supabaseAdmin
      .from('chat_messages')
      .update({
        metadata: {
          ...((source.metadata ?? {}) as Record<string, unknown>),
          life_log_recovery: {
            version: ARTIFACT_GAP_RECOVERY_VERSION,
            status: queued ? 'queued' : 'failed',
            attempted_at: now,
          },
        },
      })
      .eq('id', gap.messageId)
      .eq('user_id', userId);
    return queued;
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

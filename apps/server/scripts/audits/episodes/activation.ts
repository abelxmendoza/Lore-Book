#!/usr/bin/env tsx
/**
 * Episode activation validation (Phase 6).
 *
 * Run:
 *   EPISODE_USER_ID=<uuid> npx tsx apps/server/scripts/episodeActivationAudit.ts
 *   EPISODE_USER_ID=<uuid1>,<uuid2> npx tsx apps/server/scripts/episodeActivationAudit.ts
 */
import { supabaseAdmin } from '../../../src/services/supabaseClient';
import { episodeSegmentationTrigger } from '../../../src/services/conversationCentered/episodeSegmentationTrigger';
import { loadEpisodeStats } from '../../../src/services/conversationCentered/episodePersistenceService';
import { logger } from '../../../src/logger';
import { requireUserIds } from '../../lib/auditCommon';

async function threadsForUser(userId: string): Promise<string[]> {
  const { data: chatThreads } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id')
    .eq('user_id', userId);

  const fromChat = [...new Set((chatThreads ?? []).map((r) => r.session_id))];

  const { data: sessions } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('user_id', userId);

  const fromSessions = (sessions ?? []).map((r) => r.id);
  return [...new Set([...fromChat, ...fromSessions])];
}

async function auditUser(userId: string) {
  const threadIds = await threadsForUser(userId);
  logger.info({ userId, threadCount: threadIds.length }, 'episode_audit: starting');

  const perThread: Array<{
    threadId: string;
    episodeCount: number;
    messagesTotal: number;
    avgMessagesPerEpisode: number;
    entityCoveragePct: number;
    eventCoveragePct: number;
    episodeLabels: string[];
  }> = [];

  for (const threadId of threadIds) {
    const result = await episodeSegmentationTrigger.runNow(userId, threadId);
    if (result.episodeCount === 0) continue;

    const entityPct = result.messagesTotal
      ? Math.round((result.coverage.messagesWithEntities / result.messagesTotal) * 100)
      : 0;
    const eventPct = result.episodeCount
      ? Math.round((result.coverage.episodesWithEvents / result.episodeCount) * 100)
      : 0;

    perThread.push({
      threadId,
      episodeCount: result.episodeCount,
      messagesTotal: result.messagesTotal,
      avgMessagesPerEpisode: Number(result.coverage.avgMessagesPerEpisode.toFixed(2)),
      entityCoveragePct: entityPct,
      eventCoveragePct: eventPct,
      episodeLabels: result.episodeLabels,
    });
  }

  const totals = await loadEpisodeStats(userId);

  const report = {
    userId,
    threadsProcessed: threadIds.length,
    threadsWithEpisodes: perThread.length,
    totals,
    perThread: perThread.slice(0, 20),
  };

  console.log(JSON.stringify(report, null, 2));
  logger.info(report, 'episode_audit: complete');
}

export async function runEpisodeActivationAudit(argv: string[] = []): Promise<void> {
  const userIds = requireUserIds(
    argv,
    ['EPISODE_USER_ID', 'TARGET_USER_ID'],
    'Required: EPISODE_USER_ID or TARGET_USER_ID (or --user-id <uuid>)',
  );
  for (const userId of userIds) {
    await auditUser(userId);
  }
}

/**
 * TIMELINE FOUNDATION BACKFILL — Sprint E
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/generateTimelines.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { timelineFoundationService } from '../services/timelineFoundationService';
import { logger } from '../logger';

async function run(): Promise<void> {
  logger.info('=== TIMELINE GENERATION BACKFILL START ===');

  const { count: resolvedBefore } = await supabaseAdmin
    .from('resolved_events').select('id', { count: 'exact', head: true });

  logger.info({ resolved_events: resolvedBefore ?? 0 }, 'BEFORE');

  const { data: userRows } = await supabaseAdmin
    .from('characters').select('user_id');
  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];

  let totalResolved = 0;

  for (const userId of userIds) {
    const stats = await timelineFoundationService.generateTimelines(userId);
    totalResolved += stats.resolvedEventsCreated;
    logger.info({ userId, resolvedEventsCreated: stats.resolvedEventsCreated, skipped: stats.skipped }, 'User timeline generation complete');
  }

  const { count: resolvedAfter } = await supabaseAdmin
    .from('resolved_events').select('id', { count: 'exact', head: true });

  logger.info({ resolved_events: resolvedAfter ?? 0, resolvedEventsCreated: totalResolved }, 'AFTER');

  const validationUserId = process.env.TARGET_USER_ID;
  if (validationUserId) {
  const { data: chars } = await supabaseAdmin
    .from('characters').select('id, name').eq('user_id', validationUserId);

  for (const char of chars ?? []) {
    const timeline = await timelineFoundationService.getCharacterTimeline(validationUserId, char.id);
    logger.info({
      character: char.name,
      canonicalEventCount: timeline.length,
      events: timeline.map(e => ({
        date: e.date,
        type: e.eventType,
        title: e.title,
        connection: e.connectionCharacter,
        sources: e.sourceEntryIds.length,
        confidence: e.confidence,
      })),
    }, `Canonical timeline: ${char.name}`);
  }
  }

  logger.info('=== TIMELINE GENERATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

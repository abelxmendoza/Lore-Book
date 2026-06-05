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
  const { count: cteBefore } = await supabaseAdmin
    .from('character_timeline_events').select('id', { count: 'exact', head: true });

  logger.info({ resolved_events: resolvedBefore ?? 0, character_timeline_events: cteBefore ?? 0 }, 'BEFORE');

  // Get all distinct users who have characters
  const { data: userRows } = await supabaseAdmin
    .from('characters').select('user_id');
  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];

  let totalResolved = 0;
  let totalCTE = 0;

  for (const userId of userIds) {
    const stats = await timelineFoundationService.generateTimelines(userId);
    totalResolved += stats.resolvedEventsCreated;
    totalCTE += stats.timelineEventsCreated;
    logger.info({ userId, ...stats }, 'User timeline generation complete');
  }

  const { count: resolvedAfter } = await supabaseAdmin
    .from('resolved_events').select('id', { count: 'exact', head: true });
  const { count: cteAfter } = await supabaseAdmin
    .from('character_timeline_events').select('id', { count: 'exact', head: true });

  logger.info({ resolved_events: resolvedAfter ?? 0, character_timeline_events: cteAfter ?? 0 }, 'AFTER');

  // Validation: print timelines for each character of main user
  const MAIN_USER = '789bd607-e063-466f-a9ef-f68d24e8bb57';
  const { data: chars } = await supabaseAdmin
    .from('characters').select('id, name').eq('user_id', MAIN_USER);

  for (const char of chars ?? []) {
    const timeline = await timelineFoundationService.getCharacterTimeline(MAIN_USER, char.id);
    logger.info({
      character: char.name,
      eventCount: timeline.length,
      events: timeline.map(e => ({
        date: e.date,
        type: e.eventType,
        title: e.title,
        connection: e.connectionCharacter,
        sources: e.sourceEntryIds.length,
        confidence: e.confidence,
      })),
    }, `Timeline: ${char.name}`);
  }

  logger.info('=== TIMELINE GENERATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

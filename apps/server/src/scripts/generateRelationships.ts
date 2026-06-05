/**
 * RELATIONSHIP FOUNDATION BACKFILL — Sprint D
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/generateRelationships.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { relationshipFoundationService } from '../services/relationshipFoundationService';
import { logger } from '../logger';

async function run(): Promise<void> {
  logger.info('=== RELATIONSHIP GENERATION BACKFILL START ===');

  const { count: before } = await supabaseAdmin
    .from('character_relationships')
    .select('id', { count: 'exact', head: true });
  logger.info({ relationships: before ?? 0 }, 'BEFORE');

  const { data: userRows } = await supabaseAdmin
    .from('characters')
    .select('user_id');
  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];
  logger.info({ userCount: userIds.length }, 'Users with characters');

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const userId of userIds) {
    const stats = await relationshipFoundationService.extractRelationshipsFromMemories(userId);
    totalCreated += stats.created;
    totalUpdated += stats.updated;
    logger.info({ userId, ...stats }, 'User relationship extraction complete');

    const relationships = await relationshipFoundationService.listRelationshipsWithNames(userId);
    logger.info({ userId, relationships }, 'Relationships with evidence');
  }

  const { count: after } = await supabaseAdmin
    .from('character_relationships')
    .select('id', { count: 'exact', head: true });
  logger.info({ relationships: after ?? 0, totalCreated, totalUpdated }, 'AFTER');
  logger.info('=== RELATIONSHIP GENERATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

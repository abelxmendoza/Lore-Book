/**
 * RELATIONSHIP FOUNDATION BACKFILL — Sprint D
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/generateRelationships.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { relationshipFoundationService } from '../services/relationshipFoundationService';
import { logger } from '../logger';

const userId = process.env.RECOVERY_USER_ID;

async function run(): Promise<void> {
  logger.info('=== RELATIONSHIP GRAPH RECOVERY START ===');

  const { count: before } = await supabaseAdmin
    .from('character_relationships')
    .select('id', { count: 'exact', head: true });

  const userIds = userId
    ? [userId]
    : [
        ...new Set(
          (
            (await supabaseAdmin.from('characters').select('user_id')).data ?? []
          ).map((r: { user_id: string }) => r.user_id)
        ),
      ];

  for (const uid of userIds) {
    const stats = await relationshipFoundationService.recoverRelationshipGraph(uid);
    const coverage = await relationshipFoundationService.buildCoverageReport(uid);
    const rels = await relationshipFoundationService.listRelationshipsWithNames(uid);
    logger.info({ userId: uid, stats, coverage, sample: rels.slice(0, 15) }, 'Recovery complete');
  }

  const { count: after } = await supabaseAdmin
    .from('character_relationships')
    .select('id', { count: 'exact', head: true });

  logger.info({ before: before ?? 0, after: after ?? 0 }, '=== RELATIONSHIP GRAPH RECOVERY COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

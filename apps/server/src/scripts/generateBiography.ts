/**
 * BIOGRAPHY FOUNDATION BACKFILL — Sprint F
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/generateBiography.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { biographyFoundationService } from '../services/biographyFoundationService';
import { logger } from '../logger';

async function run(): Promise<void> {
  logger.info('=== BIOGRAPHY GENERATION BACKFILL START ===');

  const { count: before } = await supabaseAdmin
    .from('narrative_accounts').select('id', { count: 'exact', head: true })
    .eq('account_type', 'biography_snapshot');
  logger.info({ biography_snapshots: before ?? 0 }, 'BEFORE');

  // Get all users who have characters (= have enough data for biography)
  const { data: userRows } = await supabaseAdmin
    .from('characters').select('user_id');
  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];
  logger.info({ userCount: userIds.length }, 'Users with characters');

  const MAIN_USER = '789bd607-e063-466f-a9ef-f68d24e8bb57';

  for (const userId of userIds) {
    const output = await biographyFoundationService.generateBiography(userId);
    if (!output) {
      logger.warn({ userId }, 'Biography generation returned null — insufficient data');
      continue;
    }

    if (userId === MAIN_USER) {
      // Print detailed output for main user validation
      logger.info({ userId, facts: output.facts }, 'FACTS');
      logger.info({ userId, themes: output.themes }, 'THEMES');
      logger.info({ userId, periods: output.periods }, 'PERIODS');
      logger.info({
        userId,
        wordCount: output.snapshotWordCount,
        sourceEntries: output.sourceEntryIds.length,
        characters: output.characterIds.length,
        relationships: output.relationshipIds.length,
      }, 'EVIDENCE CHAIN');
      logger.info({ snapshot: output.snapshot }, 'BIOGRAPHY SNAPSHOT');
    } else {
      logger.info({ userId, wordCount: output.snapshotWordCount }, 'Biography generated');
    }
  }

  const { count: after } = await supabaseAdmin
    .from('narrative_accounts').select('id', { count: 'exact', head: true })
    .eq('account_type', 'biography_snapshot');
  logger.info({ biography_snapshots: after ?? 0 }, 'AFTER');
  logger.info('=== BIOGRAPHY GENERATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

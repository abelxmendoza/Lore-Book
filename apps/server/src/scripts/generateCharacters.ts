/**
 * CHARACTER FOUNDATION BACKFILL — Sprint C
 *
 * Promotes all canonical person entities to character records
 * and creates evidence links (character_memories).
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/generateCharacters.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { characterFoundationService } from '../services/characterFoundationService';
import { logger } from '../logger';

async function run(): Promise<void> {
  logger.info('=== CHARACTER GENERATION BACKFILL START ===');

  // Before counts
  const { count: charsBefore } = await supabaseAdmin
    .from('characters').select('id', { count: 'exact', head: true });
  const { count: memsBefore } = await supabaseAdmin
    .from('character_memories').select('id', { count: 'exact', head: true });

  logger.info({ characters: charsBefore ?? 0, character_memories: memsBefore ?? 0 }, 'BEFORE');

  // Get all distinct users who have person entities
  const { data: userRows } = await supabaseAdmin
    .from('people_places')
    .select('user_id')
    .eq('type', 'person');

  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];
  logger.info({ userCount: userIds.length }, 'Found users with person entities');

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMemories = 0;

  for (const userId of userIds) {
    const stats = await characterFoundationService.generateAllCharacters(userId);
    totalCreated += stats.created;
    totalUpdated += stats.updated;
    totalSkipped += stats.skipped;
    totalMemories += stats.memoriesLinked;
    logger.info({ userId, ...stats }, 'User character generation complete');
  }

  // After counts
  const { count: charsAfter } = await supabaseAdmin
    .from('characters').select('id', { count: 'exact', head: true });
  const { count: memsAfter } = await supabaseAdmin
    .from('character_memories').select('id', { count: 'exact', head: true });

  logger.info({ characters: charsAfter ?? 0, character_memories: memsAfter ?? 0 }, 'AFTER');
  logger.info({ totalCreated, totalUpdated, totalSkipped, totalMemories }, 'Summary');

  // Validation: show generated characters with evidence
  for (const userId of userIds) {
    const chars = await characterFoundationService.listCharactersWithEvidence(userId);
    logger.info({ userId, characters: chars }, 'Characters with evidence chain');
  }

  logger.info('=== CHARACTER GENERATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

/**
 * Character Authority backfill — seed links, merge duplicates, rebuild graph,
 * compute influence, rewrite resolved_events.people to canonical character IDs.
 *
 * Dry-run (default):
 *   cd apps/server && npx tsx src/scripts/backfillCharacterAuthority.ts
 *
 * Apply:
 *   cd apps/server && npx tsx src/scripts/backfillCharacterAuthority.ts --apply
 *
 * Single user:
 *   cd apps/server && npx tsx src/scripts/backfillCharacterAuthority.ts --user <uuid> --apply
 */

import { logger } from '../logger';
import { characterAuthorityService } from '../services/characterAuthorityService';
import { characterDeduplicationService } from '../services/characterDeduplicationService';
import { characterDomainHealthService } from '../services/characterDomainHealthService';
import { characterInfluenceService } from '../services/characterInfluenceService';
import { characterMergeService } from '../services/characterMergeService';
import { resolvedEventPeopleService } from '../services/resolvedEventPeopleService';
import { socialGraphRebuildService } from '../services/socialGraphRebuildService';
import { supabaseAdmin } from '../services/supabaseClient';
import { normalizeNameKey } from '../utils/nameNormalization';

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function listUserIds(filterUserId?: string): Promise<string[]> {
  if (filterUserId) return [filterUserId];

  const ids = new Set<string>();

  const sources = [
    supabaseAdmin.from('characters').select('user_id'),
    supabaseAdmin.from('people_places').select('user_id').eq('type', 'person'),
    supabaseAdmin.from('resolved_events').select('user_id'),
  ];

  for (const query of sources) {
    const { data, error } = await query;
    if (error) {
      logger.warn({ error }, 'Failed to list users from source table');
      continue;
    }
    for (const row of data ?? []) {
      if ((row as { user_id?: string }).user_id) ids.add((row as { user_id: string }).user_id);
    }
  }

  return Array.from(ids);
}

async function backfillUser(userId: string, apply: boolean): Promise<void> {
  logger.info({ userId, apply }, 'Starting character authority backfill for user');

  const seeded = await characterAuthorityService.seedAuthorityLinks(userId);
  logger.info({ userId, seeded }, 'Authority links seeded');

    // Conservative: only auto-merge exact canonical-name duplicates (safe batch pass).
    // Fuzzy / alias merges happen at ingestion via characterAuthorityService + registry.
    let mergeResults: Awaited<ReturnType<typeof characterDeduplicationService.mergeDuplicateGroups>> = [];
    if (apply) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('id, user_id, name, alias, metadata, created_at')
        .eq('user_id', userId);
      const byKey = new Map<string, typeof data>();
      for (const row of data ?? []) {
        const key = normalizeNameKey(row.name);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(row);
      }
      for (const rows of byKey.values()) {
        if ((rows?.length ?? 0) < 2) continue;
        const target = rows!.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
        for (const source of rows!.slice(1)) {
          try {
            await characterMergeService.merge(userId, source.id, target.id);
            mergeResults.push({ group: { canonicalId: target.id, canonicalName: target.name, duplicateIds: [source.id], members: [], avgConfidence: 1 }, merged: true });
          } catch (err) {
            logger.warn({ err, userId, source: source.id, target: target.id }, 'Exact duplicate merge failed');
          }
        }
      }
      const merged = mergeResults.filter(r => r.merged).length;
      logger.info({ userId, merged }, 'Exact duplicate merge pass complete');
    } else {
      const { data } = await supabaseAdmin.from('characters').select('name').eq('user_id', userId);
      const names = (data ?? []).map(r => normalizeNameKey(r.name));
      const dupes = names.length - new Set(names).size;
      logger.info({ userId, exactDuplicateNames: dupes, dryRun: true }, 'Would merge exact canonical-name duplicates');
    }

  const graphReport = apply
    ? await socialGraphRebuildService.rebuildForUser(userId, { mergeDuplicates: false })
    : { duplicatesMerged: 0, edgesRewritten: 0, orphanEdgesRemoved: 0, relationshipsTotal: 0, byType: {} };
  if (!apply) {
    logger.info({ userId, dryRun: true }, 'Skipping graph orphan cleanup in dry-run');
  }

  let influenceCount = 0;
  if (apply) {
    const scores = await characterInfluenceService.computeForUser(userId);
    influenceCount = scores.length;
    logger.info({ userId, influenceCount }, 'Influence scores computed');
  }

  const eventsReport = await resolvedEventPeopleService.backfillForUser(userId, !apply);
  logger.info({ userId, eventsReport }, apply ? 'Resolved events people rewritten' : 'Would rewrite resolved events people');

  const health = await characterDomainHealthService.generateReport(userId);
  logger.info({ userId, health }, 'Character domain health after backfill');

  console.log(JSON.stringify({
    userId,
    apply,
    seeded,
    duplicateGroups: apply ? mergeResults.length : (await characterDeduplicationService.findDuplicateGroups(userId)).length,
    graphReport,
    influenceCount,
    eventsReport,
    health,
  }, null, 2));
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userId = argValue('--user');
  const userIds = await listUserIds(userId);

  if (userIds.length === 0) {
    console.log('No users with character/event data found.');
    return;
  }

  logger.info({ users: userIds.length, apply }, 'Character authority backfill starting');

  for (const id of userIds) {
    try {
      await backfillUser(id, apply);
    } catch (err) {
      logger.error({ err, userId: id }, 'Character authority backfill failed for user');
    }
  }

  logger.info({ users: userIds.length, apply }, 'Character authority backfill finished');
}

run().catch(err => {
  logger.error({ err }, 'Character authority backfill crashed');
  process.exit(1);
});

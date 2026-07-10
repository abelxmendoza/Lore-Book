/**
 * Legacy `people_places` cleanup + migration — consolidated.
 *
 * Merges the former fixEntityQuality / promoteOrphanLocations / reExtractEntities
 * scripts into one entrypoint so all remaining `people_places` coupling lives in a
 * single file. This is the salvage that MUST run before the `people_places` table is
 * retired (the architecture-consolidation report's Phase 0): `promote-locations`
 * migrates orphan places into the canonical `locations` store.
 *
 * Subcommands:
 *   promote-locations [--dry-run] [--all-users] [userId]
 *       Promote orphan people_places 'place' rows (no canonical locations row by
 *       normalized name) into canonical `locations`, preserving provenance.
 *       Idempotent (reuses locationMergeService.resolveCanonicalLocationId).
 *
 *   fix-quality [--reextract]
 *       Clean people_places: delete false positives, merge name fragments into a
 *       canonical record, fix wrong entity types. With --reextract, also re-runs
 *       entity extraction across all journal entries.
 *
 *   reextract
 *       Re-run entity extraction across all journal entries only.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/cleanupLegacyEntities.ts <subcommand> [flags]
 */
import '../config';
import { pathToFileURL } from 'url';
import { supabaseAdmin } from '../services/supabaseClient';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { locationMergeService } from '../services/locationMergeService';
import { logger } from '../logger';
import { assertEntityMergeAuthorized } from '../services/entities/entityTypeCompatibility';
import { recordEntityConsolidation } from '../services/consolidationProtocol';

// ── False positives to hard-delete ────────────────────────────────────────────
const FALSE_POSITIVE_NAMES = new Set([
  'I', 'Me', 'You', 'He', 'She', 'It', 'We', 'They', 'Them', 'Him', 'Her',
  'Meanwhile', 'Hoping', 'Well', 'User', 'Lorebook', 'App',
  'way', 'the last chat', 'Lore',
]);

// ── Known type corrections ────────────────────────────────────────────────────
const TYPE_CORRECTIONS: Record<string, string> = {
  'Epirus':        'organization',
  'Abuelas House': 'place',
  'Instagram':     'platform',
  'Costco':        'organization',
};

// ── Canonical merge groups (FIRST name kept; rest are aliases, deleted) ────────
const MERGE_GROUPS: [string, ...string[]][] = [
  ['Abel Mendoza', 'Abel', 'Mendoza'],
  ['Abuela', "Abuela's", 'Abuelas'],
];

export function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── promote-locations ─────────────────────────────────────────────────────────
export type OrphanPlace = { id: string; name: string; type: string };

export async function listUserIds(allUsers: boolean, explicitUserId?: string): Promise<string[]> {
  if (explicitUserId) return [explicitUserId];
  if (!allUsers) {
    const fallback = process.env.ADMIN_USER_ID ?? process.env.OWNER_USER_ID;
    if (!fallback) throw new Error('Provide userId, --all-users, or set ADMIN_USER_ID');
    return [fallback];
  }
  const { data, error } = await supabaseAdmin.from('people_places').select('user_id').eq('type', 'place');
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  return ids.sort();
}

export async function findOrphans(userId: string): Promise<OrphanPlace[]> {
  const [{ data: pps }, { data: locs }] = await Promise.all([
    supabaseAdmin.from('people_places').select('id, name, type').eq('user_id', userId).eq('type', 'place'),
    supabaseAdmin.from('locations').select('normalized_name').eq('user_id', userId),
  ]);
  const canon = new Set((locs ?? []).map((l: { normalized_name: string }) => l.normalized_name));
  return (pps ?? []).filter((p: OrphanPlace) => !canon.has(norm(p.name))) as OrphanPlace[];
}

export async function promoteUser(userId: string, dryRun: boolean): Promise<{ orphans: number; promoted: number }> {
  const orphans = await findOrphans(userId);
  if (!orphans.length) {
    console.log(`  ${userId}: 0 orphans`);
    return { orphans: 0, promoted: 0 };
  }
  console.log(`  ${userId}: ${orphans.length} orphan(s)`);
  let promoted = 0;
  for (const o of orphans) {
    if (dryRun) {
      console.log(`    [dry-run] would promote "${o.name}" (pp ${o.id})`);
      continue;
    }
    const id = await locationMergeService.resolveCanonicalLocationId(userId, o.id);
    console.log(`    promote "${o.name}" (pp ${o.id}) -> canonical locations.id ${id}`);
    if (id) promoted += 1;
  }
  return { orphans: orphans.length, promoted: dryRun ? 0 : promoted };
}

export async function promoteLocations(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const allUsers = args.includes('--all-users');
  const userArg = args.find((a) => !a.startsWith('--'));

  const userIds = await listUserIds(allUsers, userArg);
  console.log(`\n=== Orphan Location Promotion ${dryRun ? '(DRY RUN)' : '(EXECUTE)'} ===`);
  console.log(`Users: ${userIds.length}\n`);

  let totalOrphans = 0;
  let totalPromoted = 0;
  let usersWithOrphans = 0;
  for (const userId of userIds) {
    const result = await promoteUser(userId, dryRun);
    totalOrphans += result.orphans;
    totalPromoted += result.promoted;
    if (result.orphans > 0) usersWithOrphans += 1;
  }

  console.log('\n--- Summary ---');
  console.log(`  Users scanned: ${userIds.length}`);
  console.log(`  Users with orphans: ${usersWithOrphans}`);
  console.log(`  Orphan places found: ${totalOrphans}`);
  console.log(dryRun ? `  Would promote: ${totalOrphans}` : `  Promoted: ${totalPromoted}`);
  console.log('');
}

// ── reextract (shared by `reextract` and `fix-quality --reextract`) ────────────
export async function reExtractAllEntries(): Promise<number> {
  const { data: entries, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id, user_id, content, date, tags, mood, summary, source, metadata')
    .order('created_at', { ascending: true });
  if (error) {
    logger.error({ error }, 'Failed to fetch journal entries for re-extraction');
    return 0;
  }
  let count = 0;
  for (const entry of entries ?? []) {
    try {
      await peoplePlacesService.recordEntitiesForEntry(entry as never);
      count++;
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      logger.warn({ err, entryId: (entry as { id: string }).id }, 'Re-extraction failed for entry');
    }
  }
  return count;
}

// ── fix-quality ───────────────────────────────────────────────────────────────
export async function fixQuality(args: string[]): Promise<void> {
  const userId = args.find((arg) => !arg.startsWith('--'));
  if (!userId) {
    throw new Error('fix-quality requires an explicit userId; cross-user identity cleanup is forbidden');
  }
  logger.info('=== ENTITY QUALITY BACKFILL START ===');

  const { count: before } = await supabaseAdmin
    .from('people_places')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  logger.info({ before }, 'Entities BEFORE cleanup');

  // Step 1: Delete false positives
  let deleted = 0;
  for (const name of FALSE_POSITIVE_NAMES) {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .delete()
      .eq('user_id', userId)
      .ilike('name', name)
      .select('id');
    if (error) logger.error({ error, name }, 'Failed to delete false positive');
    else if (data?.length) {
      deleted += data.length;
      logger.info({ name, count: data.length }, 'Deleted false positive');
    }
  }
  logger.info({ deleted }, 'Step 1 complete — false positives removed');

  // Step 2: Merge name-fragment groups
  let merged = 0;
  for (const [canonical, ...aliases] of MERGE_GROUPS) {
    const allNames = [canonical, ...aliases];
    const { data: groupRows, error: fetchErr } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .or(allNames.map((n) => `name.ilike.${n}`).join(','));
    if (fetchErr) {
      logger.error({ fetchErr, canonical }, 'Failed to fetch merge group');
      continue;
    }
    if (!groupRows?.length) continue;

    const canonicalRow =
      groupRows.find((r) => r.name.toLowerCase() === canonical.toLowerCase()) ??
      groupRows.sort((a, b) => b.name.length - a.name.length)[0];

    const mergedRelatedEntries = new Set<string>();
    const mergedCorrectedNames = new Set<string>();
    let mergedMentions = 0;
    let earliestMention = canonicalRow.first_mentioned_at;
    let latestMention = canonicalRow.last_mentioned_at;

    for (const row of groupRows) {
      mergedMentions += row.total_mentions ?? 0;
      (row.related_entries ?? []).forEach((id: string) => mergedRelatedEntries.add(id));
      (row.corrected_names ?? []).forEach((n: string) => mergedCorrectedNames.add(n));
      if (row.name !== canonical) mergedCorrectedNames.add(row.name);
      if (new Date(row.first_mentioned_at) < new Date(earliestMention)) earliestMention = row.first_mentioned_at;
      if (new Date(row.last_mentioned_at) > new Date(latestMention)) latestMention = row.last_mentioned_at;
    }
    mergedCorrectedNames.delete(canonical);

    // MERGE_GROUPS is a curated list of person-name fragments, and legacy
    // people_places rows frequently lack a type — fall back to the group's
    // known type (ultimately 'person') so untyped fragments still consolidate,
    // while two concretely-but-differently-typed rows stay blocked. A blocked
    // group is skipped, not fatal: one bad group must not abort the run.
    let groupAuthorized = true;
    for (const row of groupRows) {
      if (row.id === canonicalRow.id) continue;
      try {
        assertEntityMergeAuthorized({
          sourceType: row.type ?? canonicalRow.type ?? 'person',
          targetType: canonicalRow.type ?? row.type ?? 'person',
          reason: `Legacy people_places canonicalization: ${row.name} -> ${canonicalRow.name}`,
          evidenceIds: [`people_places:${row.id}`, `people_places:${canonicalRow.id}`],
          actor: 'SYSTEM',
        });
      } catch (err) {
        logger.error({ err, canonical, blockedRow: row.name }, 'Merge group blocked by type gate — skipping group');
        groupAuthorized = false;
        break;
      }
    }
    if (!groupAuthorized) continue;

    const { error: updateErr } = await supabaseAdmin
      .from('people_places')
      .update({
        name: canonical,
        total_mentions: mergedMentions,
        related_entries: Array.from(mergedRelatedEntries),
        corrected_names: Array.from(mergedCorrectedNames),
        first_mentioned_at: earliestMention,
        last_mentioned_at: latestMention,
      })
      .eq('id', canonicalRow.id)
      .eq('user_id', userId);
    if (updateErr) {
      logger.error({ updateErr, canonical }, 'Failed to update canonical record');
      continue;
    }

    const toDelete = groupRows.filter((r) => r.id !== canonicalRow.id).map((r) => r.id);
    if (toDelete.length) {
      for (const sourceId of toDelete) {
        await recordEntityConsolidation({
          userId,
          action: 'ENTITY_MERGE',
          sourceArtifactType: 'entity',
          sourceArtifactId: sourceId,
          targetArtifactId: canonicalRow.id,
          beforeState: groupRows.find((row) => row.id === sourceId) ?? { id: sourceId },
          afterState: { merged_into: canonicalRow.id, canonical_name: canonicalRow.name },
          rationale: 'Legacy people_places canonicalization after type-compatible authorization',
        });
      }
      const { error: deleteErr } = await supabaseAdmin.from('people_places').delete().eq('user_id', userId).in('id', toDelete);
      if (deleteErr) logger.error({ deleteErr, canonical }, 'Failed to delete merged duplicates');
      else {
        merged += toDelete.length;
        logger.info({ canonical, merged: toDelete.length, aliases }, 'Merged into canonical entity');
      }
    }
  }
  logger.info({ merged }, 'Step 2 complete — name fragments merged');

  // Step 3: Fix entity types
  let typesFixed = 0;
  for (const [name, correctType] of Object.entries(TYPE_CORRECTIONS)) {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .update({ type: correctType })
      .eq('user_id', userId)
      .ilike('name', name)
      .select('id');
    if (error) logger.error({ error, name }, 'Failed to fix entity type');
    else if (data?.length) {
      typesFixed += data.length;
      logger.info({ name, type: correctType }, 'Fixed entity type');
    }
  }
  logger.info({ typesFixed }, 'Step 3 complete — types corrected');

  // Step 4 (optional): Re-run entity extraction
  if (args.includes('--reextract')) {
    const reExtracted = await reExtractAllEntries();
    logger.info({ reExtracted }, 'Step 4 complete — entity re-extraction done');
  }

  const { count: after } = await supabaseAdmin
    .from('people_places')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  logger.info({ before, after, deleted, merged, typesFixed }, '=== ENTITY QUALITY BACKFILL COMPLETE ===');
}

export async function runCleanup(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'promote-locations':
      await promoteLocations(rest);
      break;
    case 'fix-quality':
      await fixQuality(rest);
      break;
    case 'reextract': {
      const reExtracted = await reExtractAllEntries();
      console.log('Done. Re-extracted:', reExtracted, 'entries');
      break;
    }
    default:
      throw new Error('Usage: cleanupLegacyEntities.ts <promote-locations|fix-quality|reextract> [flags]');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCleanup(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'cleanupLegacyEntities crashed');
      process.exit(1);
    });
}

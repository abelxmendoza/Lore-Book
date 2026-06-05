/**
 * SPRINT B — Entity Quality Backfill
 *
 * Cleans the existing people_places table:
 *   1. Deletes false positives (pronouns, gerunds, app words)
 *   2. Merges name fragments into canonical full names
 *      (Abel + Mendoza + Abel Mendoza → one record: Abel Mendoza)
 *   3. Fixes wrong entity types
 *      (Epirus: person → organization, Abuelas House: person → place)
 *   4. Re-runs entity extraction on all existing journal entries
 *      so new entries get canonical entities from the upgraded service
 *
 * Safe: uses upsert/delete, never drops real data.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/fixEntityQuality.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { logger } from '../logger';

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

// ── Canonical merge groups ────────────────────────────────────────────────────
// Each group: the FIRST name is canonical (kept), the rest are aliases (deleted).
const MERGE_GROUPS: [string, ...string[]][] = [
  ['Abel Mendoza', 'Abel', 'Mendoza'],
  ['Abuela', "Abuela's", 'Abuelas'],
];

async function run(): Promise<void> {
  logger.info('=== ENTITY QUALITY BACKFILL START ===');

  // ── Before counts ─────────────────────────────────────────────────────────
  const { count: before } = await supabaseAdmin
    .from('people_places')
    .select('id', { count: 'exact', head: true });
  logger.info({ before }, 'Entities BEFORE cleanup');

  // ── Step 1: Delete false positives ────────────────────────────────────────
  let deleted = 0;
  for (const name of FALSE_POSITIVE_NAMES) {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .delete()
      .ilike('name', name)
      .select('id');
    if (error) {
      logger.error({ error, name }, 'Failed to delete false positive');
    } else if (data?.length) {
      deleted += data.length;
      logger.info({ name, count: data.length }, 'Deleted false positive');
    }
  }
  logger.info({ deleted }, 'Step 1 complete — false positives removed');

  // ── Step 2: Merge name-fragment groups ────────────────────────────────────
  let merged = 0;
  for (const [canonical, ...aliases] of MERGE_GROUPS) {
    // Fetch all records in this group
    const allNames = [canonical, ...aliases];
    const { data: groupRows, error: fetchErr } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .or(allNames.map(n => `name.ilike.${n}`).join(','));

    if (fetchErr) {
      logger.error({ fetchErr, canonical }, 'Failed to fetch merge group');
      continue;
    }

    if (!groupRows?.length) continue;

    // Find or build the canonical record
    const canonicalRow = groupRows.find(r => r.name.toLowerCase() === canonical.toLowerCase())
      ?? groupRows.sort((a, b) => b.name.length - a.name.length)[0];

    // Aggregate data from all rows into the canonical
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
      if (new Date(row.first_mentioned_at) < new Date(earliestMention)) {
        earliestMention = row.first_mentioned_at;
      }
      if (new Date(row.last_mentioned_at) > new Date(latestMention)) {
        latestMention = row.last_mentioned_at;
      }
    }

    // Remove the canonical name from the aliases set
    mergedCorrectedNames.delete(canonical);

    // Update the canonical record
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
      .eq('id', canonicalRow.id);

    if (updateErr) {
      logger.error({ updateErr, canonical }, 'Failed to update canonical record');
      continue;
    }

    // Delete all non-canonical rows in the group
    const toDelete = groupRows.filter(r => r.id !== canonicalRow.id).map(r => r.id);
    if (toDelete.length) {
      const { error: deleteErr } = await supabaseAdmin
        .from('people_places')
        .delete()
        .in('id', toDelete);

      if (deleteErr) {
        logger.error({ deleteErr, canonical }, 'Failed to delete merged duplicates');
      } else {
        merged += toDelete.length;
        logger.info({ canonical, merged: toDelete.length, aliases }, 'Merged into canonical entity');
      }
    }
  }
  logger.info({ merged }, 'Step 2 complete — name fragments merged');

  // ── Step 3: Fix entity types ───────────────────────────────────────────────
  let typesFixed = 0;
  for (const [name, correctType] of Object.entries(TYPE_CORRECTIONS)) {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .update({ type: correctType })
      .ilike('name', name)
      .select('id');
    if (error) {
      logger.error({ error, name }, 'Failed to fix entity type');
    } else if (data?.length) {
      typesFixed += data.length;
      logger.info({ name, type: correctType }, 'Fixed entity type');
    }
  }
  logger.info({ typesFixed }, 'Step 3 complete — types corrected');

  // ── Step 4: Re-run entity extraction on all journal entries ────────────────
  const { data: entries, error: entriesErr } = await supabaseAdmin
    .from('journal_entries')
    .select('id, user_id, content, date, tags, mood, summary, source, metadata')
    .order('created_at', { ascending: true });

  if (entriesErr) {
    logger.error({ error: entriesErr }, 'Failed to fetch journal entries for re-extraction');
  } else {
    let reExtracted = 0;
    for (const entry of entries ?? []) {
      try {
        await peoplePlacesService.recordEntitiesForEntry(entry as any);
        reExtracted++;
        await new Promise(r => setTimeout(r, 100)); // gentle throttle
      } catch (err) {
        logger.warn({ err, entryId: entry.id }, 'Re-extraction failed for entry');
      }
    }
    logger.info({ reExtracted }, 'Step 4 complete — entity re-extraction done');
  }

  // ── After counts + summary ────────────────────────────────────────────────
  const { count: after } = await supabaseAdmin
    .from('people_places')
    .select('id', { count: 'exact', head: true });

  const { data: finalEntities } = await supabaseAdmin
    .from('people_places')
    .select('name, type, total_mentions')
    .order('total_mentions', { ascending: false });

  logger.info({ before, after, deleted, merged, typesFixed }, '=== ENTITY QUALITY BACKFILL COMPLETE ===');
  logger.info({ entities: finalEntities }, 'Final entity list');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});

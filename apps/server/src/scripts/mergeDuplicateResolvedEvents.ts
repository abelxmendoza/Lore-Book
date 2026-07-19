/**
 * Physically merge paraphrase-duplicate resolved_events rows.
 *
 * Read-time canonicalization (stitchedTimelineService) already hides these in
 * the stitched view; this script is the durable cleanup: it clusters each
 * user's events with the same fingerprint math, repoints every referencing
 * table at the cluster's canonical row, unions entities/units onto it, and
 * deletes the duplicates.
 *
 * Dry-run (default) prints the merge plan and touches nothing:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateResolvedEvents.ts
 *
 * Apply:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateResolvedEvents.ts --apply
 *
 * Single user:
 *   cd apps/server && npx tsx src/scripts/mergeDuplicateResolvedEvents.ts --user <uuid> --apply
 */

import {
  clusterEligibleForPhysicalMerge,
  pickMergeTitle,
} from '../services/chronologyV2/duplicateMergePolicy';
import {
  clusterDuplicateEvents,
  type CanonicalEventCluster,
  type CanonicalizableEvent,
} from '../services/chronologyV2/eventCanonicalization';
import { supabaseAdmin } from '../services/supabaseClient';

// Every table referencing resolved_events.id (from live FK constraints).
// event_unit_links is handled separately because of unique(event_id, unit_id).
const EVENT_REFS: Array<{ table: string; column: string }> = [
  // Requires migration 20260731150000 — before it, event_mentions held an
  // unrelated legacy shape with no event_id column.
  { table: 'event_mentions', column: 'event_id' },
  { table: 'event_records', column: 'resolved_event_id' },
  { table: 'event_confidence_snapshots', column: 'event_id' },
  { table: 'event_causal_links', column: 'cause_event_id' },
  { table: 'event_causal_links', column: 'effect_event_id' },
  { table: 'event_impacts', column: 'event_id' },
  { table: 'event_continuity_links', column: 'current_event_id' },
  { table: 'event_continuity_links', column: 'past_event_id' },
  { table: 'character_timeline_events', column: 'event_id' },
  { table: 'arc_event_links', column: 'resolved_event_id' },
  { table: 'event_meaning_cache', column: 'event_id' },
];

interface EventRow extends CanonicalizableEvent {
  row: {
    id: string;
    title: string | null;
    summary: string | null;
    start_time: string | null;
    created_at: string;
    people: string[] | null;
    locations: string[] | null;
    activities: string[] | null;
    metadata: Record<string, unknown> | null;
  };
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function listUserIds(filterUserId?: string): Promise<string[]> {
  if (filterUserId) return [filterUserId];
  const { data, error } = await supabaseAdmin.from('resolved_events').select('user_id');
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.user_id as string))];
}

async function loadEvents(userId: string): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, start_time, created_at, people, locations, activities, metadata')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title ?? '') as string,
    summary: (row.summary ?? '') as string,
    // Unanchored events fall back to recording time for proximity purposes.
    time: (row.start_time ?? row.created_at) as string,
    peopleIds: (row.people ?? []) as string[],
    locationIds: (row.locations ?? []) as string[],
    activityIds: (row.activities ?? []) as string[],
    row: row as EventRow['row'],
  }));
}

/**
 * Repoint one referencing column from a duplicate to the canonical id. A bulk
 * update can violate a unique constraint when the canonical row already has an
 * equivalent reference — in that case the duplicate's references are redundant
 * and are deleted instead.
 */
async function repointRefs(table: string, column: string, dupId: string, canonicalId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table)
    .update({ [column]: canonicalId })
    .eq(column, dupId);
  if (error && /duplicate|unique/i.test(error.message ?? '')) {
    const { error: deleteError } = await supabaseAdmin.from(table).delete().eq(column, dupId);
    if (deleteError) throw new Error(`${table}.${column}: ${deleteError.message}`);
  } else if (error) {
    throw new Error(`${table}.${column}: ${error.message}`);
  }
}

async function repointUnitLinks(dupId: string, canonicalId: string): Promise<void> {
  const { data: links, error } = await supabaseAdmin
    .from('event_unit_links')
    .select('unit_id')
    .eq('event_id', dupId);
  if (error) throw error;
  for (const link of links ?? []) {
    await supabaseAdmin.from('event_unit_links').upsert(
      { event_id: canonicalId, unit_id: link.unit_id },
      { onConflict: 'event_id,unit_id', ignoreDuplicates: true },
    );
  }
  const { error: deleteError } = await supabaseAdmin.from('event_unit_links').delete().eq('event_id', dupId);
  if (deleteError) throw deleteError;
}

async function applyCluster(userId: string, cluster: CanonicalEventCluster<EventRow>): Promise<void> {
  const canonical = cluster.members.find((m) => m.id === cluster.canonicalId)!;
  const dupIds = cluster.members.map((m) => m.id).filter((id) => id !== cluster.canonicalId);

  const priorMetadata = (canonical.row.metadata ?? {}) as Record<string, unknown>;
  const allUnits = [
    ...new Set(
      cluster.members.flatMap(
        (m) => ((m.row.metadata ?? {}) as Record<string, unknown>).assembled_from_units as string[] | undefined ?? [],
      ),
    ),
  ];
  const priorMerges = (priorMetadata.write_time_merges as unknown[] | undefined) ?? [];

  const { error } = await supabaseAdmin
    .from('resolved_events')
    .update({
      title: pickMergeTitle(cluster),
      summary: cluster.summary,
      people: cluster.peopleIds,
      locations: cluster.locationIds,
      activities: cluster.activityIds,
      metadata: {
        ...priorMetadata,
        ...(allUnits.length > 0 ? { assembled_from_units: allUnits } : {}),
        write_time_merges: [
          ...priorMerges,
          {
            at: new Date().toISOString(),
            via: 'mergeDuplicateResolvedEvents',
            merged_ids: dupIds,
            merged_titles: cluster.mergedTitles,
          },
        ],
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', cluster.canonicalId)
    .eq('user_id', userId);
  if (error) throw error;

  for (const dupId of dupIds) {
    await repointUnitLinks(dupId, cluster.canonicalId);
    for (const ref of EVENT_REFS) {
      await repointRefs(ref.table, ref.column, dupId, cluster.canonicalId);
    }
    const { error: deleteError } = await supabaseAdmin
      .from('resolved_events')
      .delete()
      .eq('id', dupId)
      .eq('user_id', userId);
    if (deleteError) throw new Error(`delete ${dupId}: ${deleteError.message}`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userIds = await listUserIds(argValue('--user'));

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${userIds.length} user(s)`);
  let totalMerged = 0;
  for (const userId of userIds) {
    const events = await loadEvents(userId);
    const clusters = clusterDuplicateEvents(events).filter((c) => c.members.length > 1);
    if (clusters.length === 0) continue;

    console.log(`user ${userId}: ${clusters.length} duplicate cluster(s) in ${events.length} events`);
    for (const cluster of clusters) {
      const eligibility = clusterEligibleForPhysicalMerge(
        cluster.members.map((m) => ({
          title: m.title,
          summary: m.summary,
          threadId: ((m.row.metadata ?? {}) as Record<string, unknown>).thread_id as string | undefined,
        })),
      );
      if (!eligibility.eligible) {
        console.log(`  skip cluster "${cluster.title}" (${cluster.members.length} members): ${eligibility.reason}`);
        continue;
      }
      const dupIds = cluster.members.map((m) => m.id).filter((id) => id !== cluster.canonicalId);
      console.log(`  keep ${cluster.canonicalId} "${pickMergeTitle(cluster)}" [${eligibility.reason}]`);
      for (const member of cluster.members) {
        if (member.id === cluster.canonicalId) continue;
        console.log(`    absorb ${member.id} "${member.title}"`);
      }
      totalMerged += dupIds.length;
      if (apply) await applyCluster(userId, cluster);
    }
  }
  console.log(`${apply ? 'Merged' : 'Would merge'} ${totalMerged} duplicate row(s).`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

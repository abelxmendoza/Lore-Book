/**
 * What Changed Since Last Time — Sprint H
 *
 * The primary continuity-proof surface. Answers, factually and without
 * speculation, "what did LoreBook learn while I was away?"
 *
 * Rules (locked, see Sprint H brief):
 *   - factual only — every line traces to a row created/updated after `since`
 *   - evidence-backed — counts and names, never interpretation
 *   - concise — a short list, not a report
 *   - no speculation — if nothing changed, say so plainly
 *
 * Uses foundation data from Sprints B–F. Adds no new tables, no new
 * extraction, no new memory layer — it is a read-only diff over what
 * already exists.
 */

import { supabaseAdmin } from '../supabaseClient';

export type ReinforcedEntity = {
  name: string;
  newMentionCount: number;
};

export type WhatChangedSummary = {
  since: string;
  gapDays: number;
  newMemoryCount: number;
  newCharacters: Array<{ id: string; name: string }>;
  newTimelineEventCount: number;
  strongestTheme: string | null;
  reinforcedEntities: ReinforcedEntity[];
  hasChanges: boolean;
};

const MAX_REINFORCED_ENTITIES = 3;

/**
 * Compute a factual delta of what the system recorded/learned between
 * `sinceIso` and now, scoped to one user.
 */
export async function getWhatChangedSinceLastVisit(
  userId: string,
  sinceIso: string,
): Promise<WhatChangedSummary> {
  const since = new Date(sinceIso);
  const gapDays = Math.max(0, (Date.now() - since.getTime()) / 86_400_000);

  const [entriesRes, charactersRes, eventsCountRes, biographyRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('date', sinceIso),
    supabaseAdmin
      .from('characters')
      .select('id, name, created_at, metadata')
      .eq('user_id', userId),
    supabaseAdmin
      .from('character_timeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', sinceIso),
    supabaseAdmin
      .from('narrative_accounts')
      .select('metadata')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot')
      .maybeSingle(),
  ]);

  const allCharacters = charactersRes.data ?? [];

  const newCharacters = allCharacters
    .filter(c => c.created_at && new Date(c.created_at) > since)
    .map(c => ({ id: c.id, name: c.name }));

  const existingCharacters = allCharacters.filter(c => !newCharacters.find(nc => nc.id === c.id));

  const reinforcedEntities = await computeReinforcedEntities(existingCharacters, since);

  const themes = (biographyRes.data?.metadata as any)?.themes ?? [];
  const strongestTheme: string | null = themes[0]?.theme ?? null;

  const newMemoryCount = entriesRes.count ?? 0;
  const newTimelineEventCount = eventsCountRes.count ?? 0;

  return {
    since: sinceIso,
    gapDays,
    newMemoryCount,
    newCharacters,
    newTimelineEventCount,
    strongestTheme,
    reinforcedEntities,
    hasChanges:
      newMemoryCount > 0 ||
      newCharacters.length > 0 ||
      newTimelineEventCount > 0 ||
      reinforcedEntities.length > 0,
  };
}

/**
 * For characters that already existed before `since`, count how many of
 * their source memories were recorded after `since` — i.e. people who kept
 * showing up while the user was away. Single batched lookup, no N+1.
 */
async function computeReinforcedEntities(
  existingCharacters: Array<{ id: string; name: string; metadata: any }>,
  since: Date,
): Promise<ReinforcedEntity[]> {
  const entryIdsByCharacter = new Map<string, string[]>();
  const allEntryIds = new Set<string>();

  for (const char of existingCharacters) {
    const ids: string[] = char.metadata?.source_entry_ids ?? [];
    if (!ids.length) continue;
    entryIdsByCharacter.set(char.id, ids);
    for (const id of ids) allEntryIds.add(id);
  }

  if (allEntryIds.size === 0) return [];

  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date')
    .in('id', [...allEntryIds]);

  const newEntryIds = new Set(
    (entries ?? [])
      .filter(e => e.date && new Date(e.date) > since)
      .map(e => e.id),
  );

  if (newEntryIds.size === 0) return [];

  const reinforced: ReinforcedEntity[] = [];
  for (const char of existingCharacters) {
    const ids = entryIdsByCharacter.get(char.id);
    if (!ids) continue;
    const newMentionCount = ids.filter(id => newEntryIds.has(id)).length;
    if (newMentionCount > 0) reinforced.push({ name: char.name, newMentionCount });
  }

  return reinforced
    .sort((a, b) => b.newMentionCount - a.newMentionCount)
    .slice(0, MAX_REINFORCED_ENTITIES);
}

/**
 * Render the summary as the short, factual lines the UI displays.
 * Kept server-side so the "no speculation" rule is enforced in one place.
 */
export function formatWhatChangedLines(summary: WhatChangedSummary): string[] {
  const lines: string[] = [];

  if (summary.newMemoryCount > 0) {
    lines.push(`${summary.newMemoryCount} new ${summary.newMemoryCount === 1 ? 'memory' : 'memories'} recorded`);
  }
  if (summary.newCharacters.length > 0) {
    const names = summary.newCharacters.map(c => c.name).join(', ');
    lines.push(`${summary.newCharacters.length} new ${summary.newCharacters.length === 1 ? 'character' : 'characters'} detected — ${names}`);
  }
  if (summary.newTimelineEventCount > 0) {
    lines.push(`${summary.newTimelineEventCount} new timeline ${summary.newTimelineEventCount === 1 ? 'event' : 'events'} generated`);
  }
  if (summary.strongestTheme) {
    lines.push(`${summary.strongestTheme} remains your strongest theme`);
  }
  for (const entity of summary.reinforcedEntities) {
    lines.push(`${entity.name} appeared in ${entity.newMentionCount} additional ${entity.newMentionCount === 1 ? 'memory' : 'memories'}`);
  }

  return lines;
}

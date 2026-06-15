/**
 * Sprint AM-7 — Story Coverage Diagnostics
 */

import { supabaseAdmin } from '../supabaseClient';

export type StoryCoverageReport = {
  characters_with_memories: number;
  orphan_characters: number;
  events_with_meaning: number;
  events_without_meaning: number;
  relationships_with_stories: number;
  locations_with_stories: number;
  coverage_score: number;
};

export async function buildStoryCoverageReport(userId: string): Promise<StoryCoverageReport> {
  const [
    { data: chars },
    { data: memLinks },
    { count: eventTotal },
    { count: meaningCount },
    { data: romRels },
    { data: places },
  ] = await Promise.all([
    supabaseAdmin.from('characters').select('id, metadata').eq('user_id', userId),
    supabaseAdmin.from('character_memories').select('character_id').eq('user_id', userId),
    supabaseAdmin.from('resolved_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('event_meaning_cache').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('confidence', 0.5),
    supabaseAdmin.from('romantic_relationships').select('id, green_flags, red_flags, metadata').eq('user_id', userId),
    supabaseAdmin.from('people_places').select('id, name, type').eq('user_id', userId).eq('type', 'LOCATION'),
  ]);

  const people = (chars ?? []).filter(
    (c) => !(c.metadata as Record<string, unknown>)?.is_self
  );
  const charsWithMem = new Set((memLinks ?? []).map((m) => m.character_id));
  const characters_with_memories = people.filter((c) => charsWithMem.has(c.id)).length;
  const orphan_characters = people.length - characters_with_memories;

  const eventsTotal = eventTotal ?? 0;
  const events_with_meaning = meaningCount ?? 0;
  const events_without_meaning = Math.max(0, eventsTotal - events_with_meaning);

  const relationships_with_stories = (romRels ?? []).filter((r) => {
    const greens = (r.green_flags as string[] | null)?.length ?? 0;
    const reds = (r.red_flags as string[] | null)?.length ?? 0;
    const meta = r.metadata as Record<string, unknown> | null;
    return greens + reds > 0 || Boolean(meta?.summary);
  }).length;

  let locations_with_stories = 0;
  for (const place of places ?? []) {
    const { count } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .ilike('content', `%${place.name}%`);
    if ((count ?? 0) > 0) locations_with_stories++;
  }

  const charScore = people.length > 0 ? characters_with_memories / people.length : 0;
  const eventScore = eventsTotal > 0 ? events_with_meaning / eventsTotal : 0;
  const relScore = (romRels?.length ?? 0) > 0 ? relationships_with_stories / (romRels?.length ?? 1) : 0;
  const locScore = (places?.length ?? 0) > 0 ? locations_with_stories / (places?.length ?? 1) : 0;

  const coverage_score = Math.round(((charScore + eventScore + relScore + locScore) / 4) * 100);

  return {
    characters_with_memories,
    orphan_characters,
    events_with_meaning,
    events_without_meaning,
    relationships_with_stories,
    locations_with_stories,
    coverage_score,
  };
}

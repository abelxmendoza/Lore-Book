/**
 * Sprint AM-5 — Event Reconstruction
 *
 * Reconstructs full event narratives: facts, people, timeline, meaning, relevance.
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveCharacterByName } from '../chat/foundationRecallDataService';
import { extractSignificanceFromText } from '../chat/significanceRecall';

export type EventReconstruction = {
  title: string;
  facts: string[];
  people: string[];
  timeline: Array<{ date: string | null; label: string }>;
  meaning: string | null;
  currentRelevance: string | null;
  evidence: { events: number; memories: number; meaning_cached: boolean };
};

async function loadEventsForQuery(
  userId: string,
  query: string
): Promise<Array<Record<string, unknown>>> {
  const like = `%${query}%`;
  const [{ data: byTitle }, { data: bySummary }] = await Promise.all([
    supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, start_time, people, locations, significance_score, significance_level, metadata')
      .eq('user_id', userId)
      .ilike('title', like)
      .order('start_time', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, start_time, people, locations, significance_score, significance_level, metadata')
      .eq('user_id', userId)
      .ilike('summary', like)
      .order('start_time', { ascending: false })
      .limit(5),
  ]);

  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const row of [...(byTitle ?? []), ...(bySummary ?? [])]) {
    if (seen.has(row.id as string)) continue;
    seen.add(row.id as string);
    merged.push(row as Record<string, unknown>);
  }
  return merged.slice(0, 5);
}

async function resolvePeopleNames(userId: string, peopleIds: string[]): Promise<string[]> {
  if (!peopleIds.length) return [];
  const { data } = await supabaseAdmin
    .from('characters')
    .select('name')
    .eq('user_id', userId)
    .in('id', peopleIds);
  return (data ?? []).map((c) => c.name as string);
}

export async function reconstructEventByQuery(
  userId: string,
  query: string
): Promise<EventReconstruction | null> {
  const events = await loadEventsForQuery(userId, query);
  const char = await resolveCharacterByName(userId, query);

  let targetEvents = events;
  if (targetEvents.length === 0 && char) {
    const { data: linked } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_title, event_date, event_summary, resolved_event_id')
      .eq('user_id', userId)
      .eq('character_id', char.id)
      .order('event_date', { ascending: false })
      .limit(5);

    if (linked?.length) {
      return {
        title: `Story with ${char.name}`,
        facts: linked.map((e) => e.event_summary ?? e.event_title).filter(Boolean) as string[],
        people: [char.name],
        timeline: linked.map((e) => ({
          date: e.event_date as string | null,
          label: e.event_title as string,
        })),
        meaning: null,
        currentRelevance: char.name ? `${char.name} remains part of your ongoing story.` : null,
        evidence: { events: linked.length, memories: 0, meaning_cached: false },
      };
    }
  }

  if (targetEvents.length === 0) {
    const { data: journal } = await supabaseAdmin
      .from('journal_entries')
      .select('content, date')
      .eq('user_id', userId)
      .ilike('content', `%${query}%`)
      .order('date', { ascending: false })
      .limit(5);

    if (!journal?.length) return null;

    const combined = journal.map((j) => j.content).join('\n');
    return {
      title: query,
      facts: journal.map((j) => String(j.content).slice(0, 200)),
      people: [],
      timeline: journal.map((j) => ({ date: j.date as string, label: String(j.content).slice(0, 60) })),
      meaning: extractSignificanceFromText(combined)[0] ?? null,
      currentRelevance: 'Reconstructed from journal entries — no resolved event yet.',
      evidence: { events: 0, memories: journal.length, meaning_cached: false },
    };
  }

  const primary = targetEvents[0];
  const peopleIds = (primary.people as string[]) ?? [];
  const people = await resolvePeopleNames(userId, peopleIds);

  const facts: string[] = [];
  if (primary.summary) facts.push(String(primary.summary));
  if (primary.significance_level) facts.push(`Significance: ${primary.significance_level} (${primary.significance_score}/100)`);

  const timeline = targetEvents.map((e) => ({
    date: (e.start_time as string) ?? null,
    label: e.title as string,
  }));

  const combined = targetEvents.map((e) => `${e.title} ${e.summary ?? ''}`).join('\n');
  let meaning = extractSignificanceFromText(combined)[0] ?? null;

  const { data: meaningCache } = await supabaseAdmin
    .from('event_meaning_cache')
    .select('meaning_summary, life_lesson')
    .eq('user_id', userId)
    .eq('event_id', primary.id as string)
    .maybeSingle();

  if (meaningCache?.meaning_summary) meaning = meaningCache.meaning_summary;
  else if (meaningCache?.life_lesson) meaning = meaningCache.life_lesson;

  const { count: memCount } = await supabaseAdmin
    .from('event_mentions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', primary.id as string);

  return {
    title: primary.title as string,
    facts,
    people,
    timeline,
    meaning,
    currentRelevance:
      (primary.significance_score as number) >= 60
        ? 'High-significance event in your story.'
        : 'Part of your recorded timeline.',
    evidence: {
      events: targetEvents.length,
      memories: memCount ?? 0,
      meaning_cached: !!meaningCache,
    },
  };
}

export function formatEventReconstructionForChat(reconstruction: EventReconstruction): string {
  const lines = [`**${reconstruction.title}**`, ''];

  if (reconstruction.facts.length) {
    lines.push('**Facts:**', ...reconstruction.facts.map((f) => `• ${f}`), '');
  }
  if (reconstruction.people.length) {
    lines.push('**People:**', ...reconstruction.people.map((p) => `• ${p}`), '');
  }
  if (reconstruction.timeline.length) {
    lines.push('**Timeline:**');
    for (const t of reconstruction.timeline) {
      const date = t.date ? new Date(t.date).toLocaleDateString() : 'Unknown date';
      lines.push(`• ${date}: ${t.label}`);
    }
    lines.push('');
  }
  if (reconstruction.meaning) lines.push(`**Meaning:** ${reconstruction.meaning}`, '');
  if (reconstruction.currentRelevance) {
    lines.push(`**Current relevance:** ${reconstruction.currentRelevance}`, '');
  }

  lines.push(
    '**Evidence:**',
    `• ${reconstruction.evidence.events} event(s)`,
    `• ${reconstruction.evidence.memories} linked memory mention(s)`,
    `• Meaning layer: ${reconstruction.evidence.meaning_cached ? '✓ cached' : '○ not yet generated'}`
  );

  return lines.join('\n');
}

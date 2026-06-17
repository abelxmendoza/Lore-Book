/**
 * Turning Point Detection — career, relationship, life milestone signals from memory text.
 */
import { randomUUID } from 'crypto';

import { supabaseAdmin } from '../supabaseClient';
import type { EnrichedLifeArc } from '../continuityRuntime/arcs/lifeArcSynthesisService';
import type { NarrativeEvidence, NarrativeTurningPoint, TurningPointKind } from './types';

type PatternRule = {
  kind: TurningPointKind;
  regex: RegExp;
  title: (match: string) => string;
  importance: number;
};

const TURNING_POINT_RULES: PatternRule[] = [
  { kind: 'breakup', regex: /\b(break\s*up|broke up|split up|ended (the )?relationship)\b/i, title: () => 'Relationship ended', importance: 0.85 },
  { kind: 'new_relationship', regex: /\b(started dating|new relationship|met (my )?(partner|boyfriend|girlfriend))\b/i, title: () => 'New relationship', importance: 0.8 },
  { kind: 'job_offer', regex: /\b(job offer|offered (the )?position|got (the )?offer)\b/i, title: () => 'Job offer', importance: 0.9 },
  { kind: 'career_change', regex: /\b(new job|started (at|working)|onboarding|hired|left (my )?job|quit|resigned)\b/i, title: () => 'Career change', importance: 0.85 },
  { kind: 'move', regex: /\b(moved to|relocat|new apartment|new place|moved out)\b/i, title: () => 'Relocation', importance: 0.75 },
  { kind: 'graduation', regex: /\b(graduat|completed (my )?degree|finished (school|college|university))\b/i, title: () => 'Graduation', importance: 0.8 },
  { kind: 'launch', regex: /\b(launched|shipped|released|went live|published)\b/i, title: () => 'Launch', importance: 0.8 },
  { kind: 'death', regex: /\b(passed away|died|funeral|memorial)\b/i, title: () => 'Loss', importance: 0.95 },
  { kind: 'achievement', regex: /\b(won|achieved|succeeded|landed|earned|promoted)\b/i, title: () => 'Achievement', importance: 0.75 },
  { kind: 'major_failure', regex: /\b(failed|rejected|fired|laid off|bankrupt|collapsed)\b/i, title: () => 'Major setback', importance: 0.8 },
  { kind: 'awakening', regex: /\b(realized|epiphany|wake[- ]?up call|turning point)\b/i, title: () => 'Awakening', importance: 0.7 },
];

function matchArcs(text: string, arcs: EnrichedLifeArc[]): string[] {
  const lower = text.toLowerCase();
  return arcs
    .filter((a) => a.evidence.some((e) => lower.includes(e.toLowerCase().slice(0, 20))) || lower.includes(a.title.toLowerCase()))
    .map((a) => a.id)
    .slice(0, 3);
}

function detectInText(
  text: string,
  date: string | null,
  arcs: EnrichedLifeArc[],
  source: string
): NarrativeTurningPoint[] {
  const hits: NarrativeTurningPoint[] = [];
  for (const rule of TURNING_POINT_RULES) {
    if (!rule.regex.test(text)) continue;
    const snippet = text.slice(0, 120).trim();
    hits.push({
      id: randomUUID(),
      title: rule.title(snippet),
      date,
      kind: rule.kind,
      importance: rule.importance,
      affectedArcIds: matchArcs(text, arcs),
      evidence: [{
        id: randomUUID(),
        label: snippet,
        source,
        date,
        confidence: rule.importance,
        storyState: 'confirmed',
      }],
      confidence: rule.importance,
      storyState: 'confirmed',
    });
  }
  return hits;
}

export async function detectTurningPoints(
  userId: string,
  arcs: EnrichedLifeArc[]
): Promise<NarrativeTurningPoint[]> {
  const { data: journalRows } = await supabaseAdmin
    .from('journal_entries')
    .select('id, content, summary, date, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(80)
    .catch(() => ({ data: [] as Array<{ id: string; content?: string; summary?: string; date?: string; created_at?: string }> }));

  const { data: eventRows } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, description, event_date')
    .eq('user_id', userId)
    .order('event_date', { ascending: false })
    .limit(60);

  const all: NarrativeTurningPoint[] = [];

  for (const row of journalRows ?? []) {
    const text = String(row.content ?? '');
    if (!text.trim()) continue;
    const date = row.date ?? row.created_at ?? null;
    all.push(...detectInText(text, date, arcs, 'journal'));
  }

  for (const row of eventRows ?? []) {
    const text = `${row.title ?? ''} ${row.description ?? ''}`;
    if (!text.trim()) continue;
    all.push(...detectInText(text, row.event_date ?? null, arcs, 'event'));
  }

  // Dedupe by kind + date + title prefix
  const seen = new Set<string>();
  const deduped: NarrativeTurningPoint[] = [];
  for (const tp of all.sort((a, b) => b.importance - a.importance)) {
    const key = `${tp.kind}|${tp.date ?? ''}|${tp.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tp);
  }
  return deduped.slice(0, 25);
}

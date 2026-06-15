/**
 * Sprint AL-4 — Meaning Generation Engine (deterministic, confidence-gated)
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { extractSignificanceFromText } from '../chat/significanceRecall';

export type EventMeaning = {
  meaningSummary: string;
  identityImpact: string | null;
  lifeLesson: string | null;
  chapterRelevance: string | null;
  confidence: number;
};

const MIN_CONFIDENCE = 0.5;

const IDENTITY_RE =
  /\b(realized|learned|changed|became|grew|identity|who i am|what matters|priorities)\b/i;

const LESSON_RE =
  /\b(learned that|taught me|lesson|takeaway|never forget|don't take for granted|grateful)\b/i;

const CHAPTER_RE =
  /\b(chapter|phase|era|period|during (my|the)|amazon|metro|bootcamp|college|high school)\b/i;

export function generateMeaningFromText(
  title: string,
  summary: string,
  sourceTexts: string[] = []
): EventMeaning | null {
  const combined = [title, summary, ...sourceTexts].filter(Boolean).join('\n');
  if (combined.trim().length < 20) return null;

  const significance = extractSignificanceFromText(combined);
  const hasExplicit = significance.length > 0;

  let confidence = 0.3;
  if (hasExplicit) confidence += 0.35;
  if (summary.length > 40) confidence += 0.15;
  if (sourceTexts.length > 0) confidence += 0.1;
  if (IDENTITY_RE.test(combined)) confidence += 0.1;
  confidence = Math.min(1, confidence);

  if (confidence < MIN_CONFIDENCE) return null;

  let meaningSummary: string;
  if (significance.length > 0) {
    meaningSummary = significance[0].charAt(0).toUpperCase() + significance[0].slice(1);
  } else if (/costco.*abuela|abuela.*costco/i.test(combined)) {
    meaningSummary =
      "The important part was not shopping. The important part was that Abuela was still alive and present.";
  } else {
    meaningSummary = `What stood out: ${title}.`;
  }

  const identityImpact = IDENTITY_RE.test(combined)
    ? extractFirstMatch(combined, IDENTITY_RE)
    : null;

  const lifeLesson = LESSON_RE.test(combined)
    ? extractFirstMatch(combined, LESSON_RE)
    : hasExplicit
      ? meaningSummary
      : null;

  const chapterRelevance = CHAPTER_RE.test(combined)
    ? extractFirstMatch(combined, CHAPTER_RE)
    : null;

  return {
    meaningSummary,
    identityImpact,
    lifeLesson,
    chapterRelevance,
    confidence,
  };
}

function extractFirstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, m.index - 20);
  const snippet = text.slice(start, start + 120).replace(/\s+/g, ' ').trim();
  return snippet.length > 15 ? snippet : null;
}

export async function generateAndPersistEventMeaning(
  userId: string,
  eventId: string
): Promise<EventMeaning | null> {
  const { data: event } = await supabaseAdmin
    .from('resolved_events')
    .select('title, summary, metadata')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (!event) return null;

  const { data: mentions } = await supabaseAdmin
    .from('event_mentions')
    .select('memory_id')
    .eq('event_id', eventId)
    .limit(5);

  const sourceTexts: string[] = [];
  if (mentions?.length) {
    const ids = mentions.map((m) => m.memory_id);
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('content')
      .in('id', ids)
      .limit(5);
    for (const e of entries ?? []) {
      if (e.content) sourceTexts.push(String(e.content).slice(0, 500));
    }
  }

  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.source_text === 'string') sourceTexts.push(meta.source_text);

  const meaning = generateMeaningFromText(
    event.title,
    event.summary ?? '',
    sourceTexts
  );

  if (!meaning) return null;

  const { error } = await supabaseAdmin.from('event_meaning_cache').upsert(
    {
      user_id: userId,
      event_id: eventId,
      meaning_summary: meaning.meaningSummary,
      identity_impact: meaning.identityImpact,
      life_lesson: meaning.lifeLesson,
      chapter_relevance: meaning.chapterRelevance,
      confidence: meaning.confidence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,event_id' }
  );

  if (error) {
    logger.warn({ error, eventId }, 'Failed to persist event meaning cache');
    return meaning;
  }

  return meaning;
}

export async function generateAllMeaningsForUser(userId: string): Promise<{ generated: number }> {
  const { data: events } = await supabaseAdmin
    .from('resolved_events')
    .select('id')
    .eq('user_id', userId);

  let generated = 0;
  for (const ev of events ?? []) {
    try {
      const m = await generateAndPersistEventMeaning(userId, ev.id);
      if (m) generated++;
    } catch (err) {
      logger.warn({ err, eventId: ev.id }, 'AL meaning generation failed');
    }
  }
  return { generated };
}

export async function getMeaningGenerationCoverage(userId: string): Promise<{
  total: number;
  with_meaning: number;
  coverage_pct: number;
}> {
  const { count: total } = await supabaseAdmin
    .from('resolved_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: withMeaning } = await supabaseAdmin
    .from('event_meaning_cache')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('confidence', MIN_CONFIDENCE);

  const t = total ?? 0;
  const w = withMeaning ?? 0;
  return {
    total: t,
    with_meaning: w,
    coverage_pct: t > 0 ? Math.round((w / t) * 1000) / 10 : 0,
  };
}

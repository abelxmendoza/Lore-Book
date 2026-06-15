/**
 * Sprint AL-2 — Event Significance Engine (deterministic, no LLM)
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type SignificanceLevel = 'legendary' | 'major' | 'moderate' | 'minor';

export type SignificanceInputs = {
  peopleCount: number;
  locationsCount: number;
  sourceUnitCount: number;
  emotionalIntensity: number;
  identityImpactCount: number;
  relationshipImpact: number;
  careerImpact: number;
  isFirstOccurrence: boolean;
  hasLifeChangeIndicator: boolean;
  hasExplicitMeaning: boolean;
  title: string;
  summary: string;
  type: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const LIFE_CHANGE_RE =
  /\b(job offer|got (the )?job|promoted|fired|laid off|breakup|broke up|divorce|engaged|married|moved|graduation|diagnosis|death|died|passed away|baby|pregnant|quit|started (a )?new)\b/i;

const CAREER_RE = /\b(job|work|career|interview|promotion|boss|employer|amazon|office|offer)\b/i;

const RELATIONSHIP_RE = /\b(breakup|date|relationship|romantic|love|partner|ghosted|blocked|family|abuela|wedding)\b/i;

const EXPLICIT_MEANING_RE =
  /\b(highlight was|what mattered|meant (a lot|so much)|important because|still alive|grateful|cherish|never forget)\b/i;

export function computeEventSignificance(inputs: SignificanceInputs): {
  significanceScore: number;
  significanceLevel: SignificanceLevel;
} {
  let score = 0;

  score += Math.min(15, inputs.peopleCount * 4);
  score += Math.min(10, inputs.locationsCount * 3);
  score += Math.min(15, inputs.sourceUnitCount * 3);
  score += Math.min(15, inputs.emotionalIntensity * 15);
  score += Math.min(10, inputs.identityImpactCount * 5);
  score += Math.min(10, inputs.relationshipImpact * 10);
  score += Math.min(10, inputs.careerImpact * 10);

  if (inputs.isFirstOccurrence) score += 8;
  if (inputs.hasLifeChangeIndicator) score += 20;
  if (inputs.hasExplicitMeaning) score += 18;

  const text = `${inputs.title} ${inputs.summary}`.toLowerCase();
  if (/\bbreakup\b|job offer|graduation|death|married/.test(text)) score += 15;
  if (/costco|grocery|errand/.test(text) && !inputs.hasExplicitMeaning) score += 5;

  const significanceScore = clamp(Math.round(score), 0, 100);

  let significanceLevel: SignificanceLevel = 'minor';
  if (significanceScore >= 80) significanceLevel = 'legendary';
  else if (significanceScore >= 60) significanceLevel = 'major';
  else if (significanceScore >= 35) significanceLevel = 'moderate';

  return { significanceScore, significanceLevel };
}

function buildInputsFromEvent(
  event: {
    title: string;
    summary: string | null;
    type: string | null;
    people: string[] | null;
    locations: string[] | null;
    emotional_intensity?: number | null;
    metadata?: Record<string, unknown> | null;
  },
  extras: {
    sourceUnitCount: number;
    identityImpactCount: number;
    isFirstOccurrence: boolean;
  }
): SignificanceInputs {
  const text = `${event.title} ${event.summary ?? ''}`;
  return {
    peopleCount: event.people?.length ?? 0,
    locationsCount: event.locations?.length ?? 0,
    sourceUnitCount: extras.sourceUnitCount,
    emotionalIntensity: event.emotional_intensity ?? 0,
    identityImpactCount: extras.identityImpactCount,
    relationshipImpact: RELATIONSHIP_RE.test(text) ? 1 : 0,
    careerImpact: CAREER_RE.test(text) ? 1 : 0,
    isFirstOccurrence: extras.isFirstOccurrence,
    hasLifeChangeIndicator: LIFE_CHANGE_RE.test(text),
    hasExplicitMeaning: EXPLICIT_MEANING_RE.test(text),
    title: event.title,
    summary: event.summary ?? '',
    type: event.type ?? '',
  };
}

export async function calculateEventSignificance(
  userId: string,
  eventId: string
): Promise<{ significanceScore: number; significanceLevel: SignificanceLevel; inputs: SignificanceInputs }> {
  const { data: event } = await supabaseAdmin
    .from('resolved_events')
    .select('title, summary, type, people, locations, emotional_intensity, metadata, start_time')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }

  const [{ count: mentionCount }, { count: impactCount }, { count: priorSameTitle }] = await Promise.all([
    supabaseAdmin
      .from('event_mentions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId),
    supabaseAdmin
      .from('event_impacts')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId),
    supabaseAdmin
      .from('resolved_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .ilike('title', event.title)
      .lt('start_time', event.start_time ?? new Date().toISOString()),
  ]);

  const inputs = buildInputsFromEvent(event, {
    sourceUnitCount: mentionCount ?? 0,
    identityImpactCount: impactCount ?? 0,
    isFirstOccurrence: (priorSameTitle ?? 0) === 0,
  });

  const { significanceScore, significanceLevel } = computeEventSignificance(inputs);
  return { significanceScore, significanceLevel, inputs };
}

export async function persistEventSignificance(
  userId: string,
  eventId: string,
  significanceScore: number,
  significanceLevel: SignificanceLevel
): Promise<void> {
  await supabaseAdmin
    .from('resolved_events')
    .update({
      significance_score: significanceScore,
      significance_level: significanceLevel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('user_id', userId);
}

export async function scoreAndPersistEvent(
  userId: string,
  eventId: string
): Promise<{ significanceScore: number; significanceLevel: SignificanceLevel }> {
  const { significanceScore, significanceLevel } = await calculateEventSignificance(userId, eventId);
  await persistEventSignificance(userId, eventId, significanceScore, significanceLevel);
  return { significanceScore, significanceLevel };
}

export async function scoreAllEventsForUser(userId: string): Promise<{ scored: number }> {
  const { data: events } = await supabaseAdmin
    .from('resolved_events')
    .select('id')
    .eq('user_id', userId);

  let scored = 0;
  for (const ev of events ?? []) {
    try {
      await scoreAndPersistEvent(userId, ev.id);
      scored++;
    } catch (err) {
      logger.warn({ err, eventId: ev.id }, 'AL event significance scoring failed');
    }
  }
  return { scored };
}

export async function getEventSignificanceCoverage(userId: string): Promise<{
  total: number;
  scored: number;
  coverage_pct: number;
}> {
  const { count: total } = await supabaseAdmin
    .from('resolved_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: scored } = await supabaseAdmin
    .from('resolved_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('significance_score', 0);

  const t = total ?? 0;
  const s = scored ?? 0;
  return {
    total: t,
    scored: s,
    coverage_pct: t > 0 ? Math.round((s / t) * 1000) / 10 : 0,
  };
}

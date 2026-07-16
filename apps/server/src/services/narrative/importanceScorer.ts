/**
 * Event importance — dynamic, not fixed. "Started a new job" outranks
 * "went clubbing" outranks "bought lunch", and stored significance scores
 * from ingestion are honored when they say more than the text does.
 */
import type { AnchorBuildEvent } from './narrativeAnchorTypes';
import type { EventImportance, EventImportanceLevel } from './narrativeCognitionTypes';

const VERY_HIGH_RE =
  /\b(started (a )?(new )?job|first day|got (hired|fired|laid off)|quit (my )?job|moved (in|out|to)|broke up|breakup|got engaged|married|was born|passed away|died|diagnosed|graduated|launched|arrested|hospitalized)\b/i;
const HIGH_RE =
  /\b(interview|promotion|first (week|month)|big (fight|argument)|hospital|accident|reunion|farewell|last day|signed (a )?lease)\b/i;
const MEDIUM_RE =
  /\b(club|show|concert|party|festival|date night|night out|trip|hike|beach|birthday|barbecue|bbq|game night)\b/i;

const LEVEL_SCORE: Record<EventImportanceLevel, number> = {
  very_high: 0.95,
  high: 0.75,
  medium: 0.5,
  low: 0.2,
};

function levelFromText(text: string): { level: EventImportanceLevel; reason: string } {
  if (VERY_HIGH_RE.test(text)) return { level: 'very_high', reason: 'life-changing event language' };
  if (HIGH_RE.test(text)) return { level: 'high', reason: 'significant milestone language' };
  if (MEDIUM_RE.test(text)) return { level: 'medium', reason: 'notable social/leisure event' };
  return { level: 'low', reason: 'routine event' };
}

function levelFromScore(score: number): EventImportanceLevel {
  if (score >= 0.85) return 'very_high';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export function scoreEventImportance(event: AnchorBuildEvent): EventImportance {
  const text = `${event.title} ${event.summary ?? ''}`;
  const fromText = levelFromText(text);
  const reasons = [fromText.reason];

  let score = LEVEL_SCORE[fromText.level];

  // Ingestion significance (0..100) can raise but never lower text signal —
  // a stored "significant" flag on a routine title usually knows something.
  const stored = Number(event.significanceScore ?? 0) / 100;
  if (stored > score) {
    score = stored;
    reasons.push('stored significance score');
  }

  // Events touching many known entities pull more narrative weight.
  if (event.entityIds.length >= 4) {
    score = Math.min(1, score + 0.05);
    reasons.push('involves many people/places');
  }

  return { score: Math.round(score * 100) / 100, level: levelFromScore(score), reasons };
}

/**
 * Relationship attention — who the user THINKS about vs who they TALK about.
 * Rumination, callbacks, and future worries are thinking; mention counts and
 * shared events are talking. The two diverge constantly (a mourned ex is
 * thought about far more than mentioned).
 */
import { RUMINATION_RE } from './emotionalSignalEngine';
import type { TimelineEntry } from './relationshipTimeline';
import type { RelationshipAttention } from './relationshipCognitionTypes';

const FUTURE_CONCERN_RE =
  /\b(what if (she|he|they)|hope (she|he|they)|worried about (her|him|them)|wonder (if|whether) (she|he|they)|next time (i|we) see)\b/i;
const CALLBACK_RE =
  /\b(reminded me of (her|him|them)|that song|remember when (she|he|they|we)|brought (her|him|them) back|couldn'?t help thinking)\b/i;
const EMOTIONAL_REFERENCE_RE =
  /\b(miss(ing)?|heartbroken|still hurts|lonely without|wish (she|he|they))\b/i;

function saturate(raw: number, scale = 2): number {
  return raw <= 0 ? 0 : 1 - Math.exp(-raw / scale);
}

export function resolveRelationshipAttention(timeline: TimelineEntry[]): RelationshipAttention {
  const reasons: string[] = [];
  let thinking = 0;
  let talking = 0;

  for (const entry of timeline) {
    talking += 0.3; // every evidence item is a mention of some kind
    if (RUMINATION_RE.test(entry.text)) thinking += 0.8;
    if (CALLBACK_RE.test(entry.text)) thinking += 0.6;
    if (FUTURE_CONCERN_RE.test(entry.text)) thinking += 0.5;
    if (EMOTIONAL_REFERENCE_RE.test(entry.text)) thinking += 0.5;
    if (entry.source === 'shared_experience') talking += 0.4;
  }

  const thinkingScore = Math.round(saturate(thinking) * 100) / 100;
  const talkingScore = Math.round(saturate(talking) * 100) / 100;

  if (thinkingScore > talkingScore + 0.2) {
    reasons.push('on your mind more than in your stories');
  } else if (talkingScore > thinkingScore + 0.2) {
    reasons.push('present in events more than in your inner monologue');
  } else if (thinkingScore > 0) {
    reasons.push('thought about and talked about in balance');
  }

  return { thinkingScore, talkingScore, reasons };
}

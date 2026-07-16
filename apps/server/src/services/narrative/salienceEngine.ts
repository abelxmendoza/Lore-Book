/**
 * Salience Engine — who matters most RIGHT NOW.
 *
 * Importance is dynamic: gravity (long-run narrative pull) blended with
 * recency decay, bond category, and emotional weight. An ended relationship
 * stays salient while it is still being processed, then fades — importance is
 * never just relationship status.
 */
import { computeEntityGravity } from './entityGravityService';
import type { PersonSalienceInput } from './relationshipSalience';
import type { PersonSalience, SalienceCategory } from './narrativeCognitionTypes';

/** Half-life of recency in days: a month-old mention is worth half a fresh one. */
const RECENCY_HALF_LIFE_DAYS = 30;
/** Beyond this silence, a person is considered fading regardless of history. */
const FADING_AFTER_DAYS = 45;

const CATEGORY_BOOST: Record<SalienceCategory, number> = {
  family: 0.10,
  partner_or_ex: 0.06,
  mentor: 0.04,
  coworker: 0.04,
  friend: 0.03,
  community: 0.0,
  other: 0.0,
};

const CATEGORY_LABEL: Record<SalienceCategory, string> = {
  family: 'family bond',
  partner_or_ex: 'romantic bond (current or past)',
  mentor: 'mentor',
  coworker: 'works with you',
  friend: 'friendship',
  community: 'shared community',
  other: 'appears in your story',
};

function recencyFactor(daysSinceLastSeen: number | null): number {
  if (daysSinceLastSeen == null) return 0.3; // unknown recency: neither fresh nor gone
  return Math.pow(0.5, daysSinceLastSeen / RECENCY_HALF_LIFE_DAYS);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computePersonSalience(
  inputs: PersonSalienceInput[],
  now: string,
): PersonSalience[] {
  return inputs
    .map((input) => {
      const gravity = computeEntityGravity(input.gravity);
      const recency = recencyFactor(input.daysSinceLastSeen);
      const reasons: string[] = [CATEGORY_LABEL[input.category]];

      let score = 0.55 * gravity.gravityScore + 0.25 * recency + CATEGORY_BOOST[input.category];

      if (input.daysSinceLastSeen != null && input.daysSinceLastSeen <= 7) {
        reasons.push('came up within the last week');
      }
      if (gravity.components.emotionalWeight >= 0.6) {
        score += 0.08;
        reasons.push('emotionally heavy mentions');
      }
      if (gravity.components.eventParticipation >= 0.4) {
        reasons.push('part of recent events');
      }
      // Ended bonds keep emotional salience while fresh, then time decay wins.
      if (input.hasEndedBond) {
        score += 0.06 * recency;
        reasons.push('relationship ended but still on your mind');
      }
      if (gravity.components.relationshipStrength >= 0.5) {
        reasons.push('long-standing closeness');
      }

      const trend: PersonSalience['trend'] =
        input.daysSinceLastSeen != null && input.daysSinceLastSeen > FADING_AFTER_DAYS
          ? 'fading'
          : input.daysSinceLastSeen != null &&
              input.daysSinceLastSeen <= 7 &&
              gravity.components.mentionCount < 0.5
            ? 'rising'
            : 'steady';
      if (trend === 'rising') reasons.push('newer presence, growing fast');
      if (trend === 'fading') reasons.push('has gone quiet lately');

      // Confidence tracks evidence richness, not the score itself.
      const evidenceRichness =
        gravity.components.mentionCount * 0.4 +
        gravity.components.threadCount * 0.3 +
        (input.gravity.facts?.length ? 0.3 : 0);
      const confidence = clamp01(0.35 + evidenceRichness * 0.6);

      return {
        personId: input.gravity.entityId,
        name: input.gravity.name,
        category: input.category,
        score: Math.round(clamp01(score) * 100) / 100,
        reasonBreakdown: reasons,
        trend,
        lastUpdated: now,
        confidence: Math.round(confidence * 100) / 100,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * The answer to "who matters most?" — a SMALL ranked list with reasons.
 * Never the whole character book: capped, thresholded, category-diverse.
 */
export function rankMostImportant(
  salience: PersonSalience[],
  opts: { max?: number; minScore?: number; maxPerCategory?: number } = {},
): PersonSalience[] {
  const max = opts.max ?? 6;
  const minScore = opts.minScore ?? 0.22;
  const maxPerCategory = opts.maxPerCategory ?? 3;

  const picked: PersonSalience[] = [];
  const perCategory = new Map<SalienceCategory, number>();
  for (const person of salience) {
    if (picked.length >= max) break;
    if (person.score < minScore) break;
    const used = perCategory.get(person.category) ?? 0;
    if (used >= maxPerCategory) continue;
    perCategory.set(person.category, used + 1);
    picked.push(person);
  }
  return picked;
}

/** People whose importance is growing — new presences with fresh momentum. */
export function risingPeople(salience: PersonSalience[], max = 4): PersonSalience[] {
  return salience.filter((p) => p.trend === 'rising').slice(0, max);
}

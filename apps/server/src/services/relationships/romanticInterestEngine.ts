/**
 * Romantic Interest Engine — continuous scores, not labels.
 *
 * Interest (0–100) and emotional attachment (0–1) are computed SEPARATELY:
 * low attraction + high attachment (a mourned ex) and high attraction + low
 * attachment (a new spark) are both real and both representable.
 */
import { extractEmotionalSignals, isRumination } from './emotionalSignalEngine';
import { weightFor } from './relationshipConfidence';
import type { TimelineEntry } from './relationshipTimeline';
import type {
  DimensionScore,
  EmotionalSignal,
  InterestScore,
  RelationshipDimension,
} from './relationshipCognitionTypes';

export type WeightedSignal = EmotionalSignal & {
  evidenceWeight: number;
  at?: string;
};

/** Extract signals from every evidence item, carrying its source weight. */
export function collectWeightedSignals(timeline: TimelineEntry[]): WeightedSignal[] {
  const collected: WeightedSignal[] = [];
  for (const entry of timeline) {
    for (const signal of extractEmotionalSignals(entry.text)) {
      collected.push({ ...signal, evidenceWeight: weightFor(entry), at: entry.at });
    }
  }
  return collected;
}

function contribution(signal: WeightedSignal): number {
  return signal.polarity * signal.strength * signal.evidenceWeight;
}

function sumDimension(signals: WeightedSignal[], dimension: RelationshipDimension): number {
  return signals
    .filter((s) => s.dimension === dimension)
    .reduce((sum, s) => sum + contribution(s), 0);
}

function saturate(raw: number, scale = 2): number {
  // Smooth saturation: 1 - e^(-x/scale) keeps repeated evidence from
  // exploding past certainty while letting strong history dominate.
  return raw <= 0 ? 0 : 1 - Math.exp(-raw / scale);
}

const INTEREST_POSITIVE: RelationshipDimension[] = [
  'romantic_interest',
  'sexual_attraction',
  'hope',
  'curiosity',
  'communication',
];
const INTEREST_NEGATIVE: RelationshipDimension[] = ['avoidance', 'closure', 'conflict'];

/**
 * Romantic interest right now, 0–100, with the decay multiplier already
 * applied by the caller's timeline analysis (decayMultiplier).
 */
export function computeInterestScore(
  signals: WeightedSignal[],
  opts: { decayMultiplier: number; ruminationCount?: number },
): InterestScore {
  const reasons: string[] = [];
  let raw = 0;

  for (const dimension of INTEREST_POSITIVE) {
    const value = sumDimension(signals, dimension);
    if (value > 0.3) {
      raw += value;
      reasons.push(`${dimension.replace(/_/g, ' ')} signals`);
    }
  }
  if ((opts.ruminationCount ?? 0) > 0) {
    raw += Math.min(1, (opts.ruminationCount ?? 0) * 0.4);
    reasons.push('keeps resurfacing in your thoughts');
  }

  let penalty = 0;
  for (const dimension of INTEREST_NEGATIVE) {
    const value = sumDimension(signals, dimension);
    if (value > 0.3) {
      penalty += value;
      reasons.push(`${dimension.replace(/_/g, ' ')} pulling the other way`);
    }
  }

  const base = saturate(raw) * (1 - Math.min(0.8, saturate(penalty)));
  const score = Math.round(base * opts.decayMultiplier * 100);

  const evidenceMass = signals.reduce((sum, s) => sum + s.evidenceWeight, 0);
  const confidence = Math.round(Math.min(0.9, 0.3 + evidenceMass * 0.1) * 100) / 100;

  return { score, confidence, reasonBreakdown: reasons.length > 0 ? reasons : ['no romantic signals found'] };
}

/**
 * Emotional attachment — independent of attraction and of status. Grief,
 * missing someone, and rumination all KEEP attachment elevated after an
 * ending; closure statements are what bring it down.
 */
export function computeEmotionalAttachment(
  signals: WeightedSignal[],
  opts: { decayMultiplier: number; ruminationCount?: number },
): DimensionScore {
  const reasons: string[] = [];
  let raw = sumDimension(signals, 'emotional_attachment');
  if (raw > 0.3) reasons.push('attachment language');

  const grief = sumDimension(signals, 'grief');
  if (grief > 0.3) {
    raw += grief * 0.8;
    reasons.push('grief keeps the bond present');
  }
  if ((opts.ruminationCount ?? 0) >= 2) {
    raw += 0.5;
    reasons.push('repeated rumination');
  }

  const closure = sumDimension(signals, 'closure');
  if (closure > 0.3) {
    raw *= Math.max(0.2, 1 - closure * 0.5);
    reasons.push('closure statements easing it');
  }

  const evidenceMass = signals.reduce((sum, s) => sum + s.evidenceWeight, 0);
  return {
    dimension: 'emotional_attachment',
    score: Math.round(saturate(raw) * opts.decayMultiplier * 100) / 100,
    confidence: Math.round(Math.min(0.9, 0.3 + evidenceMass * 0.1) * 100) / 100,
    reasons: reasons.length > 0 ? reasons : ['no attachment signals found'],
  };
}

export function countRumination(timeline: TimelineEntry[]): number {
  return timeline.filter((entry) => isRumination(entry.text)).length;
}

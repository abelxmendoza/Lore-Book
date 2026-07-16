/**
 * Relationship transitions — stage inference and probabilistic trajectory.
 *
 * Rules with teeth:
 * - explicit labels and user corrections beat everything inferred
 * - one hookup is a one-night stand until later evidence evolves it
 * - a breakup makes an ex; renewed warmth after an ending is rekindling
 * - silence while busy is 'uncertain', never 'fading'
 */
import { detectBoundaryEvents, detectSexualEvents, isClosureStatement } from './emotionalSignalEngine';
import type { TimelineEntry } from './relationshipTimeline';
import type { WeightedSignal } from './romanticInterestEngine';
import type {
  BoundaryEvent,
  RomanticStage,
  SexualEvent,
  SexualRelationshipState,
  StagePeriod,
  TrajectoryEstimate,
  WorkloadState,
} from './relationshipCognitionTypes';

const STAGE_LABEL_MAP: Array<{ pattern: RegExp; stage: RomanticStage }> = [
  { pattern: /\b(spouse|wife|husband|married)\b/i, stage: 'spouse' },
  { pattern: /\b(fianc[eé]e?|engaged)\b/i, stage: 'fiance' },
  { pattern: /\b(boyfriend|girlfriend|partner)\b/i, stage: 'partner' },
  { pattern: /\b(ex[- ]?(girlfriend|boyfriend|partner)?|former partner)\b/i, stage: 'ex' },
  { pattern: /\b(friends? with benefits|fwb)\b/i, stage: 'friends_with_benefits' },
  { pattern: /\b(situationship)\b/i, stage: 'situationship' },
  { pattern: /\b(lover)\b/i, stage: 'lover' },
  { pattern: /\b(dating|seeing (each other|her|him|them))\b/i, stage: 'dating' },
  { pattern: /\b(talking stage|we('re| are) talking)\b/i, stage: 'talking' },
  { pattern: /\b(one night stand)\b/i, stage: 'one_night_stand' },
  { pattern: /\b(crush)\b/i, stage: 'crush' },
  { pattern: /\b(friend)\b/i, stage: 'friend' },
  { pattern: /\b(acquaintance)\b/i, stage: 'acquaintance' },
];

/** Endings that stage inference must respect. */
const ENDED_STAGES: ReadonlySet<RomanticStage> = new Set([
  'ex',
  'former_partner',
  'moving_on',
  'blocked',
  'no_interest',
]);

export function collectBoundaryEvents(timeline: TimelineEntry[]): BoundaryEvent[] {
  return timeline.flatMap((entry) => detectBoundaryEvents(entry.text, entry.at));
}

export function collectSexualEvents(timeline: TimelineEntry[]): SexualEvent[] {
  return timeline.flatMap((entry) => detectSexualEvents(entry.text, entry.at));
}

/** Sexual relationship state from explicit contact evidence ONLY. */
export function resolveSexualState(
  events: SexualEvent[],
  opts: { relationshipEnded: boolean },
): { state: SexualRelationshipState; confidence: number; evidenceExcerpts: string[] } {
  if (events.length === 0) {
    // Absence of evidence is absence of claim — 'unknown', never inferred.
    return { state: 'unknown', confidence: 0.4, evidenceExcerpts: [] };
  }
  const excerpts = events.map((e) => e.excerpt).slice(0, 3);
  const encounters = events.filter((e) => e.kind === 'sexual_encounter');
  if (encounters.length >= 2) {
    return {
      state: opts.relationshipEnded ? 'past_sexual_relationship' : 'ongoing_sexual_relationship',
      confidence: 0.8,
      evidenceExcerpts: excerpts,
    };
  }
  if (encounters.length === 1) {
    return {
      state: opts.relationshipEnded ? 'past_sexual_relationship' : 'sexual_encounter',
      confidence: 0.75,
      evidenceExcerpts: excerpts,
    };
  }
  if (events.some((e) => e.kind === 'made_out')) {
    return { state: 'made_out', confidence: 0.75, evidenceExcerpts: excerpts };
  }
  return { state: 'kissed', confidence: 0.75, evidenceExcerpts: excerpts };
}

function explicitStageFromLabels(
  storedTypes: string[],
  timeline: TimelineEntry[],
): { stage: RomanticStage; excerpt: string } | null {
  // Later evidence beats stored labels beats older evidence: scan text newest
  // first, then stored relationship types.
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    for (const { pattern, stage } of STAGE_LABEL_MAP) {
      if (pattern.test(timeline[i].text)) return { stage, excerpt: timeline[i].text.slice(0, 90) };
    }
  }
  for (const type of storedTypes) {
    for (const { pattern, stage } of STAGE_LABEL_MAP) {
      if (pattern.test(type)) return { stage, excerpt: `stored relationship: ${type}` };
    }
  }
  return null;
}

/**
 * Infer the current romantic stage. Confidence stays honest: everything here
 * is a distribution collapsed to its mode, and the caller carries the hedge.
 */
export function inferRomanticStage(opts: {
  timeline: TimelineEntry[];
  storedTypes: string[];
  signals: WeightedSignal[];
  interestScore: number;
  boundaryEvents: BoundaryEvent[];
  sexualEvents: SexualEvent[];
}): StagePeriod {
  const { timeline, storedTypes, signals, interestScore, boundaryEvents, sexualEvents } = opts;
  const excerpts = (items: Array<{ excerpt: string }>) => items.map((i) => i.excerpt).slice(0, 3);

  const closure = timeline.some((entry) => isClosureStatement(entry.text));
  const brokeUp = boundaryEvents.some((e) => e.kind === 'breakup');
  const blocked = boundaryEvents.some((e) => e.kind === 'blocking');
  const reconciled = boundaryEvents.some((e) => e.kind === 'reconciliation');
  const label = explicitStageFromLabels(storedTypes, timeline);
  const ended = closure || brokeUp || ENDED_STAGES.has(label?.stage ?? 'unknown');

  if (blocked) {
    return { stage: 'blocked', confidence: 0.85, evidenceExcerpts: excerpts(boundaryEvents) };
  }

  // Ended, but the user says they're past it → moving on. Corrections rule.
  if (closure) {
    return {
      stage: 'moving_on',
      confidence: 0.85,
      evidenceExcerpts: timeline.filter((e) => isClosureStatement(e.text)).map((e) => e.text.slice(0, 90)),
    };
  }

  // Renewed warmth after an ending = rekindling, not a fresh crush.
  const recentPositive = interestScore >= 35;
  if ((brokeUp || ENDED_STAGES.has(label?.stage ?? 'unknown')) && (reconciled || recentPositive)) {
    return {
      stage: 'rekindling',
      confidence: 0.6,
      evidenceExcerpts: excerpts([...boundaryEvents, ...signals]),
    };
  }

  if (label && !(ended && !ENDED_STAGES.has(label.stage))) {
    return { stage: label.stage, confidence: 0.8, evidenceExcerpts: [label.excerpt] };
  }
  if (brokeUp) {
    return { stage: 'ex', confidence: 0.8, evidenceExcerpts: excerpts(boundaryEvents) };
  }

  // One hookup, no romance/commitment evidence → one-night stand until it evolves.
  const encounters = sexualEvents.filter((e) => e.kind === 'sexual_encounter');
  if (encounters.length === 1 && interestScore < 40) {
    return { stage: 'one_night_stand', confidence: 0.7, evidenceExcerpts: excerpts(encounters) };
  }
  if (encounters.length >= 2) {
    const attachment = signals.some(
      (s) => s.dimension === 'emotional_attachment' && s.polarity === 1,
    );
    return {
      stage: attachment ? 'situationship' : 'friends_with_benefits',
      confidence: 0.6,
      evidenceExcerpts: excerpts(encounters),
    };
  }

  // Pure interest gradient.
  if (interestScore >= 75) return { stage: 'strong_crush', confidence: 0.6, evidenceExcerpts: excerpts(signals) };
  if (interestScore >= 55) return { stage: 'crush', confidence: 0.6, evidenceExcerpts: excerpts(signals) };
  if (interestScore >= 35) return { stage: 'curious', confidence: 0.55, evidenceExcerpts: excerpts(signals) };
  if (interestScore >= 15) return { stage: 'mild_interest', confidence: 0.5, evidenceExcerpts: excerpts(signals) };
  if (timeline.length > 0) return { stage: 'acquaintance', confidence: 0.45, evidenceExcerpts: [] };
  return { stage: 'unknown', confidence: 0.3, evidenceExcerpts: [] };
}

/**
 * Probabilistic direction. The invariant that matters most: silence while
 * the user is busy yields 'uncertain' — never 'fading', never 'ended'.
 */
export function inferTrajectory(opts: {
  interestScore: number;
  attachmentScore: number;
  recentSignalSum: number;
  pastSignalSum: number;
  boundaryEvents: BoundaryEvent[];
  hasClosure: boolean;
  daysSinceEvidence: number | null;
  workload: WorkloadState;
  decayFrozen: boolean;
}): TrajectoryEstimate {
  const reasons: string[] = [];
  const { boundaryEvents, hasClosure, daysSinceEvidence, workload } = opts;

  if (hasClosure) {
    return {
      direction: 'ended',
      probability: 0.85,
      reasons: ['you said you\'ve moved on — corrections override inference'],
    };
  }
  if (boundaryEvents.some((e) => e.kind === 'blocking')) {
    return { direction: 'ended', probability: 0.8, reasons: ['blocking is a hard ending signal'] };
  }
  const brokeUp = boundaryEvents.some((e) => e.kind === 'breakup');
  const reconciled = boundaryEvents.some((e) => e.kind === 'reconciliation');
  if (brokeUp && (reconciled || opts.recentSignalSum > 0.5)) {
    return {
      direction: 'rekindling',
      probability: 0.55,
      reasons: ['warmth after an ending'],
    };
  }
  if (brokeUp && opts.attachmentScore < 0.3) {
    return { direction: 'ended', probability: 0.7, reasons: ['breakup with attachment settling'] };
  }

  const silent = daysSinceEvidence != null && daysSinceEvidence > 30;
  if (silent && (workload.busyWithWork || workload.busyWithProject || workload.globalActivityDrop)) {
    reasons.push('quiet lately, but your attention has been elsewhere — silence is not evidence');
    return { direction: 'uncertain', probability: 0.6, reasons };
  }

  const momentum = opts.recentSignalSum - opts.pastSignalSum * 0.5;
  if (momentum > 0.6) {
    return { direction: 'growing', probability: 0.65, reasons: ['recent signals outweigh the past'] };
  }
  if (boundaryEvents.some((e) => e.kind === 'rejection' || e.kind === 'ghosting')) {
    return { direction: 'cooling', probability: 0.6, reasons: ['rejection/ghosting in the record'] };
  }
  if (silent && opts.recentSignalSum === 0 && opts.interestScore < 20 && opts.attachmentScore < 0.3) {
    return { direction: 'fading', probability: 0.55, reasons: ['long unexplained quiet with little holding it'] };
  }
  if (opts.recentSignalSum > 0) {
    return { direction: 'stable', probability: 0.6, reasons: ['steady recent presence'] };
  }
  return { direction: 'uncertain', probability: 0.5, reasons: ['not enough recent evidence to call a direction'] };
}

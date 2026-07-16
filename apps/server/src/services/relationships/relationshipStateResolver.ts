/**
 * Relationship State Resolver — one honest snapshot per person, assembled
 * from independent dimensions. Attraction ≠ attachment ≠ status ≠ attention;
 * this is where they meet without collapsing into a single label.
 */
import { isClosureStatement } from './emotionalSignalEngine';
import { aggregateConfidence } from './relationshipConfidence';
import { decayMultiplier } from './relationshipDecay';
import {
  buildTimeline,
  daysSinceLastEvidence,
  lastEvidenceAt,
  splitRecent,
} from './relationshipTimeline';
import {
  collectWeightedSignals,
  computeEmotionalAttachment,
  computeInterestScore,
  countRumination,
} from './romanticInterestEngine';
import {
  collectBoundaryEvents,
  collectSexualEvents,
  inferRomanticStage,
  inferTrajectory,
  resolveSexualState,
} from './relationshipTransitions';
import { resolveRelationshipAttention } from './relationshipAttention';
import type {
  RelationshipCognitionContext,
  RelationshipPerson,
  RelationshipSnapshot,
} from './relationshipCognitionTypes';

const ENDED_STAGES = new Set(['ex', 'former_partner', 'moving_on', 'blocked', 'no_interest']);

function signalSum(signals: ReturnType<typeof collectWeightedSignals>): number {
  return signals.reduce(
    (sum, s) => sum + (s.polarity === 1 ? s.strength * s.evidenceWeight : 0),
    0,
  );
}

function summarize(snapshot: Omit<RelationshipSnapshot, 'reasonSummary'>): string {
  const stage = snapshot.romanticStage.stage.replace(/_/g, ' ');
  const parts = [
    `${snapshot.personName}: ${stage} (${snapshot.trajectory.direction})`,
    `interest ${snapshot.interest.score}/100`,
    `attachment ${Math.round(snapshot.emotionalAttachment.score * 100)}/100`,
  ];
  if (snapshot.attention.thinkingScore > snapshot.attention.talkingScore + 0.2) {
    parts.push('more thought about than mentioned');
  }
  return parts.join(' · ');
}

/**
 * Build the snapshot for one person. `hasCompetingEvidence` says whether the
 * rest of the graph shows fresh momentum elsewhere (a new interest) — decay
 * is only allowed to bite when it does.
 */
export function resolveRelationshipSnapshot(
  person: RelationshipPerson,
  ctx: RelationshipCognitionContext,
  opts: { hasCompetingEvidence?: boolean } = {},
): RelationshipSnapshot {
  const evidence = ctx.evidence.filter((item) => item.personId === person.personId);
  const timeline = buildTimeline(evidence);
  const days = daysSinceLastEvidence(timeline, ctx.now);

  const decay = decayMultiplier({
    daysSinceEvidence: days,
    workload: ctx.workload,
    hasCompetingEvidence: opts.hasCompetingEvidence ?? false,
  });

  const signals = collectWeightedSignals(timeline);
  const rumination = countRumination(timeline);
  const boundaryEvents = collectBoundaryEvents(timeline);
  const sexualEvents = collectSexualEvents(timeline);
  const hasClosure = timeline.some((entry) => isClosureStatement(entry.text));

  const interest = computeInterestScore(signals, {
    decayMultiplier: decay.multiplier,
    ruminationCount: rumination,
  });
  const attachment = computeEmotionalAttachment(signals, {
    decayMultiplier: decay.multiplier,
    ruminationCount: rumination,
  });

  const romanticStage = inferRomanticStage({
    timeline,
    storedTypes: person.storedRelationshipTypes,
    signals,
    interestScore: interest.score,
    boundaryEvents,
    sexualEvents,
  });

  const relationshipEnded = hasClosure || ENDED_STAGES.has(romanticStage.stage);
  const sexualRelationship = resolveSexualState(sexualEvents, { relationshipEnded });

  const { recent, past } = splitRecent(timeline, ctx.now);
  const trajectory = inferTrajectory({
    interestScore: interest.score,
    attachmentScore: attachment.score,
    recentSignalSum: signalSum(collectWeightedSignals(recent)),
    pastSignalSum: signalSum(collectWeightedSignals(past)),
    boundaryEvents,
    hasClosure,
    daysSinceEvidence: days,
    workload: ctx.workload,
    decayFrozen: decay.frozen,
  });

  const attention = resolveRelationshipAttention(timeline);

  const partial: Omit<RelationshipSnapshot, 'reasonSummary'> = {
    personId: person.personId,
    personName: person.name,
    // Multiple simultaneous relationship types are stored as-is, never merged.
    relationshipTypes: [...new Set(person.storedRelationshipTypes)],
    romanticStage,
    interest,
    emotionalAttachment: attachment,
    sexualRelationship,
    trajectory,
    attention,
    confidence: aggregateConfidence(evidence),
    lastEvidenceAt: lastEvidenceAt(timeline),
  };

  return { ...partial, reasonSummary: summarize(partial) };
}

/**
 * Snapshots for everyone with relationship evidence. Competing-evidence flags
 * are computed across the set: someone with fresh romantic momentum makes
 * decay *possible* (never automatic) for the quiet ones.
 */
export function resolveAllSnapshots(ctx: RelationshipCognitionContext): RelationshipSnapshot[] {
  const withEvidence = ctx.people.filter((person) =>
    ctx.evidence.some((item) => item.personId === person.personId),
  );

  // First pass without competition to find who has fresh momentum.
  const firstPass = withEvidence.map((person) =>
    resolveRelationshipSnapshot(person, ctx, { hasCompetingEvidence: false }),
  );
  const cutoff = Date.parse(ctx.now) - 30 * 86_400_000;
  const freshInterest = new Set(
    firstPass
      .filter(
        (s) =>
          s.interest.score >= 40 &&
          s.lastEvidenceAt != null &&
          Date.parse(s.lastEvidenceAt) >= cutoff,
      )
      .map((s) => s.personId),
  );

  return withEvidence.map((person) => {
    const competing = [...freshInterest].some((id) => id !== person.personId);
    return resolveRelationshipSnapshot(person, ctx, { hasCompetingEvidence: competing });
  });
}

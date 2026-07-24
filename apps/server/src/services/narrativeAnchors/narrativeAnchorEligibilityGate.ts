/**
 * Anchor eligibility — shared membership alone never qualifies.
 */

import type { NarrativeAnchorEligibility } from './narrativeAnchorCognitionTypes';

export function evaluateAnchorEligibility(input: {
  eventCount: number;
  distinctTimepoints: number;
  distinctPeopleCount: number;
  userCentrality: number;
  narrativeCoherence: number;
  temporalCoherence: number;
  emotionalGravity: number;
  identityImpact: number;
  recurrenceStrength: number;
  explicitUserImportance: number;
  membershipOnly?: boolean;
}): NarrativeAnchorEligibility {
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (input.membershipOnly) {
    blockers.push('membership_only');
  }

  if (input.userCentrality < 0.65) {
    blockers.push('low_user_centrality');
  } else {
    reasons.push('user_centrality_ok');
  }

  if (input.narrativeCoherence < 0.6) {
    blockers.push('low_narrative_coherence');
  } else {
    reasons.push('narrative_coherence_ok');
  }

  const eventOk = input.eventCount >= 2 || input.explicitUserImportance >= 0.85;
  if (!eventOk) {
    blockers.push('insufficient_events_or_importance');
  } else {
    reasons.push(input.eventCount >= 2 ? 'multi_event' : 'major_single_event');
  }

  const impactOk =
    input.emotionalGravity >= 0.45
    || input.identityImpact >= 0.45
    || input.recurrenceStrength >= 0.55
    || input.explicitUserImportance >= 0.85;
  if (!impactOk) {
    blockers.push('low_impact_and_recurrence');
  } else {
    reasons.push('impact_or_recurrence_ok');
  }

  const eligible = blockers.length === 0;

  return {
    eventCount: input.eventCount,
    distinctTimepoints: input.distinctTimepoints,
    distinctPeopleCount: input.distinctPeopleCount,
    userCentrality: input.userCentrality,
    narrativeCoherence: input.narrativeCoherence,
    temporalCoherence: input.temporalCoherence,
    emotionalGravity: input.emotionalGravity,
    identityImpact: input.identityImpact,
    recurrenceStrength: input.recurrenceStrength,
    explicitUserImportance: input.explicitUserImportance,
    eligible,
    reasons,
    blockers,
  };
}

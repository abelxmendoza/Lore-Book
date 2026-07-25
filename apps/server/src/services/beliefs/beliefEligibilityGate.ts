import { isSpeechActBeliefEligible } from './beliefSpeechActClassifier';
import type {
  BeliefEligibilityResult,
  BeliefSubjectResolution,
  PropositionDurability,
  SpeechAct,
} from './beliefTypes';

export function evaluateBeliefEligibility(input: {
  speechAct: SpeechAct;
  subject: BeliefSubjectResolution;
  durability: PropositionDurability;
  semanticallyComplete: boolean;
  routingIsReject: boolean;
}): BeliefEligibilityResult {
  const reasons: string[] = [];
  const speechActAllowed = isSpeechActBeliefEligible(input.speechAct);
  if (!speechActAllowed) reasons.push(`speech_act_not_eligible:${input.speechAct}`);

  const subjectResolved = input.subject.method !== 'UNRESOLVED' && input.subject.confidence >= 0.5;
  if (!subjectResolved) reasons.push('subject_unresolved');

  const durableEnough = !['NOT_MEMORY_WORTHY', 'SESSION_ONLY'].includes(input.durability);
  // Events/states/plans are "eligible" to enter the queue as routed proposals, not as durable truth.
  const queueWorthy = durableEnough || ['EVENT_ONLY', 'TEMPORARY_STATE', 'PLAN_ONLY', 'SEMI_DURABLE'].includes(input.durability);
  if (!queueWorthy) reasons.push(`durability_not_memory_worthy:${input.durability}`);

  if (!input.semanticallyComplete) reasons.push('semantically_incomplete');
  if (input.routingIsReject && !queueWorthy) reasons.push('routed_to_reject');

  const notNoise = speechActAllowed && queueWorthy;
  const eligible = speechActAllowed && subjectResolved && queueWorthy && input.semanticallyComplete;

  return {
    eligible,
    speechActAllowed,
    subjectResolved,
    durableEnough: ['DURABLE', 'SEMI_DURABLE'].includes(input.durability),
    semanticallyComplete: input.semanticallyComplete,
    notNoise,
    reasons,
  };
}

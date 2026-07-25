import type {
  BeliefDecision,
  BeliefRoutingTarget,
  BeliefSensitivity,
  ConfirmationRequirement,
  CorrectionTargetResolution,
  SpeechAct,
  TruthMutation,
} from './beliefTypes';

export function resolveBeliefConfirmationRequirement(input: {
  decision: BeliefDecision;
  mutation: TruthMutation;
  speechAct: SpeechAct;
  routingTarget: BeliefRoutingTarget;
  sensitivity: BeliefSensitivity[];
  correctionTarget: CorrectionTargetResolution;
}): ConfirmationRequirement {
  if (input.decision === 'REJECT' || input.mutation === 'REJECT') return 'REJECT';

  if (
    (input.speechAct === 'RETRACTION' || input.speechAct === 'CORRECTION')
    && input.correctionTarget.matchMethod === 'UNRESOLVED'
  ) {
    return 'BLOCK_UNTIL_CONFIRMED';
  }

  if (input.sensitivity.some((s) => ['SEXUAL', 'REPUTATIONAL', 'LEGAL', 'HIGHLY_PRIVATE'].includes(s))) {
    return 'BLOCK_UNTIL_CONFIRMED';
  }

  if (input.mutation === 'ADD_EVIDENCE') return 'AUTO_APPLY';

  if (
    input.routingTarget === 'ENTITY_REGISTRY'
    || input.routingTarget === 'EVENT'
    || input.routingTarget === 'TEMPORAL_STATE'
    || input.routingTarget === 'PLAN'
  ) {
    return 'PASSIVE_CONFIRMATION';
  }

  if (
    input.speechAct === 'RETRACTION'
    || input.speechAct === 'CORRECTION'
    || input.routingTarget === 'RELATIONSHIP_GRAPH'
    || input.sensitivity.includes('IDENTITY_CRITICAL')
  ) {
    return 'EXPLICIT_CONFIRMATION';
  }

  return 'EXPLICIT_CONFIRMATION';
}

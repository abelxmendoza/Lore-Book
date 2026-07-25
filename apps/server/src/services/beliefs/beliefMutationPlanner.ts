import type {
  BeliefDecision,
  BeliefDuplicateDecision,
  BeliefRoutingTarget,
  CompiledProposition,
  CorrectionTargetResolution,
  SpeechAct,
  TruthMutationPlan,
} from './beliefTypes';

export function planBeliefMutation(input: {
  speechAct: SpeechAct;
  routingTarget: BeliefRoutingTarget;
  duplicateDecision: BeliefDuplicateDecision;
  correctionTarget: CorrectionTargetResolution;
  proposition: CompiledProposition;
  evidenceIds: string[];
  eligible: boolean;
}): { plan: TruthMutationPlan; decision: BeliefDecision } {
  const { speechAct, routingTarget, duplicateDecision, correctionTarget, proposition, evidenceIds, eligible } = input;

  if (
    duplicateDecision === 'EXACT_DUPLICATE'
    || duplicateDecision === 'SEMANTIC_DUPLICATE'
    || duplicateDecision === 'ENTAILS_EXISTING'
  ) {
    return {
      decision: 'ADD_EVIDENCE',
      plan: {
        mutation: 'ADD_EVIDENCE',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Semantic or exact duplicate — attach evidence instead of creating a new belief',
        confidence: 0.9,
        evidenceIds,
      },
    };
  }

  if (!eligible || routingTarget === 'REJECT') {
    return {
      decision: 'REJECT',
      plan: {
        mutation: 'REJECT',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Not eligible as a durable or routed memory proposal',
        confidence: proposition.confidenceBreakdown.overallEligibilityConfidence,
        evidenceIds,
      },
    };
  }

  if (speechAct === 'RETRACTION' || speechAct === 'CORRECTION') {
    if (correctionTarget.selectedBeliefId) {
      return {
        decision: 'SUPERSEDE',
        plan: {
          mutation: 'SUPERSEDE',
          targetBeliefIds: [correctionTarget.selectedBeliefId],
          compiledProposition: proposition,
          reason: 'Supersede the conflicting belief',
          confidence: correctionTarget.confidence,
          evidenceIds,
        },
      };
    }
    return {
      decision: 'ADD_NEGATIVE_CONSTRAINT',
      plan: {
        mutation: 'ADD_NEGATIVE_CONSTRAINT',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'No matching active belief found — store USER_DENIED / MUST_NOT_ASSERT constraint',
        confidence: 0.7,
        evidenceIds,
      },
    };
  }

  if (routingTarget === 'EVENT' || routingTarget === 'MOMENT') {
    return {
      decision: 'ROUTE',
      plan: {
        mutation: 'ROUTE_TO_EVENT',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Route to Events / Moments — not a durable belief',
        confidence: 0.85,
        evidenceIds,
      },
    };
  }

  if (routingTarget === 'TEMPORAL_STATE') {
    return {
      decision: 'ROUTE',
      plan: {
        mutation: 'ROUTE_TO_STATE',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Route to temporary state with temporal bounds',
        confidence: 0.85,
        evidenceIds,
      },
    };
  }

  if (routingTarget === 'PLAN') {
    return {
      decision: 'ROUTE',
      plan: {
        mutation: 'ROUTE_TO_PLAN',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Route to plan — not a completed event or durable belief',
        confidence: 0.85,
        evidenceIds,
      },
    };
  }

  if (routingTarget === 'PROJECT_GOAL' || routingTarget === 'PROJECT_REQUIREMENT' || routingTarget === 'UI_PREFERENCE') {
    return {
      decision: 'ROUTE',
      plan: {
        mutation: 'ROUTE_TO_PROJECT',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: `Route to ${routingTarget}`,
        confidence: 0.8,
        evidenceIds,
      },
    };
  }

  if (routingTarget === 'ASSISTANT_FEEDBACK') {
    return {
      decision: 'REJECT',
      plan: {
        mutation: 'REJECT',
        targetBeliefIds: [],
        compiledProposition: proposition,
        reason: 'Assistant/product feedback is not autobiographical truth',
        confidence: 0.95,
        evidenceIds,
      },
    };
  }

  return {
    decision: 'REVIEW',
    plan: {
      mutation: 'ADD',
      targetBeliefIds: [],
      compiledProposition: proposition,
      reason: `Add compiled proposition to ${routingTarget}`,
      confidence: proposition.confidenceBreakdown.overallEligibilityConfidence,
      evidenceIds,
    },
  };
}

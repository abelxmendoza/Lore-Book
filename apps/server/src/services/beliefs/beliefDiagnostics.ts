import type {
  BeliefCognitionResult,
  BeliefDiagnosticTrace,
} from './beliefTypes';

export function buildBeliefDiagnostic(result: Omit<BeliefCognitionResult, 'diagnostic'> & {
  sourceText: string;
  claimText: string;
  warnings?: string[];
}): BeliefDiagnosticTrace {
  return {
    sourceText: result.sourceText,
    claimText: result.claimText,
    speechAct: result.speechAct,
    subject: result.proposition.subject
      ? {
          subjectEntityId: result.proposition.subject.entityId,
          displayName: result.proposition.subject.displayName,
          entityType: result.proposition.subject.entityType,
          sourceSpan: '',
          method: 'UNRESOLVED',
          confidence: result.proposition.subject.confidence,
          rejectedCandidates: [],
        }
      : {
          displayName: 'Unknown',
          entityType: 'UNKNOWN',
          sourceSpan: '',
          method: 'UNRESOLVED',
          confidence: 0,
          rejectedCandidates: [],
        },
    rejectedSubjectCandidates: [],
    domain: result.proposition.domain,
    durability: result.proposition.durability,
    modality: result.proposition.modality,
    routingTarget: result.routingTarget,
    duplicateDecision: result.duplicateDecision,
    correctionTarget: result.correctionTarget,
    eligibility: result.eligibility,
    confirmationRequirement: result.confirmationRequirement,
    finalDecision: result.decision,
    reasons: result.eligibility.reasons.length
      ? result.eligibility.reasons
      : [`decision:${result.decision}`, `route:${result.routingTarget}`],
    warnings: result.warnings ?? [],
  };
}

export function isBeliefCognitionGateEnabled(): boolean {
  const raw = process.env.BELIEF_COGNITION_GATE;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}

export function serializeBeliefCognitionMetadata(result: BeliefCognitionResult): Record<string, unknown> {
  return {
    belief_cognition_version: 'v2',
    speech_act: result.speechAct,
    compiled_proposition: result.proposition,
    rendered_proposition: result.proposition.renderedText,
    resolved_subject: result.proposition.subject.displayName,
    predicate: result.proposition.predicate,
    domain: result.proposition.domain,
    durability: result.proposition.durability,
    modality: result.proposition.modality,
    temporal_scope: result.proposition.temporalScope,
    attribution: result.proposition.attribution,
    routing_target: result.routingTarget,
    decision: result.decision,
    mutation: result.mutationPlan,
    confirmation_requirement: result.confirmationRequirement,
    duplicate_decision: result.duplicateDecision,
    correction_target: result.correctionTarget,
    sensitivity_labels: result.sensitivity,
    confidence_breakdown: result.proposition.confidenceBreakdown,
    fingerprint: result.fingerprint,
    diagnostic_reasons: result.diagnostic.reasons,
    warnings: result.diagnostic.warnings,
  };
}

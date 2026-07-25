import { isUnsafeTherapyDiagnosisClaim } from '../contextualLore';
import { resolveBeliefAttribution } from './beliefAttributionResolver';
import { resolveBeliefConfirmationRequirement } from './beliefConfirmationPolicy';
import { resolveBeliefCorrectionTarget } from './beliefCorrectionTargetResolver';
import { classifyBeliefDomain } from './beliefDomainClassifier';
import { buildPropositionFingerprint, resolveBeliefDuplicate } from './beliefDuplicateResolver';
import { classifyBeliefDurability } from './beliefDurabilityClassifier';
import { evaluateBeliefEligibility } from './beliefEligibilityGate';
import { resolveBeliefModality, resolveBeliefPolarity } from './beliefModalityResolver';
import { planBeliefMutation } from './beliefMutationPlanner';
import { routeBeliefOntology } from './beliefOntologyRouter';
import { compileBeliefProposition, isSemanticallyCompleteBelief } from './beliefPropositionCompiler';
import { resolveBeliefSensitivity } from './beliefSensitivityResolver';
import { classifyBeliefSpeechAct } from './beliefSpeechActClassifier';
import { resolveBeliefSubject } from './beliefSubjectResolver';
import { resolveBeliefTemporalScope } from './beliefTemporalScopeResolver';
import type {
  BeliefCognitionInput,
  BeliefCognitionResult,
  BeliefConfidenceBreakdown,
  BeliefDiagnosticTrace,
} from './beliefTypes';

function proposalKindHint(result: Pick<BeliefCognitionResult, 'speechAct' | 'proposition' | 'routingTarget'>): BeliefCognitionResult['proposalKindHint'] {
  if (result.speechAct === 'RETRACTION') return 'retraction';
  if (result.speechAct === 'CORRECTION') return 'correction';
  switch (result.proposition.domain) {
    case 'OCCUPATION':
    case 'EMPLOYMENT':
      return 'occupation';
    case 'RELATIONSHIP':
      return 'relationship';
    case 'EVENT':
      return 'event';
    case 'PLAN':
      return 'plan';
    case 'EMOTIONAL_STATE':
    case 'PHYSICAL_STATE':
      return 'emotional_state';
    case 'ENTITY_CLASSIFICATION':
      return 'entity_classification';
    case 'IDENTITY':
    case 'RESIDENCE':
      return 'identity_fact';
    case 'PREFERENCE':
    case 'UI_PREFERENCE':
      return 'preference';
    default:
      return 'durable_fact';
  }
}

export class BeliefCognitionEngine {
  evaluate(input: BeliefCognitionInput): BeliefCognitionResult {
    const now = input.now ?? new Date();
    const claimText = (input.claimText || input.sourceText || '').trim();
    const sourceText = (input.sourceText || claimText).trim();
    const evidenceIds = input.evidenceIds?.length
      ? input.evidenceIds
      : (input.sourceMessageId ? [input.sourceMessageId] : []);

    const speech = classifyBeliefSpeechAct(claimText, sourceText);

    // Contextual lore guard: "needs therapy" diagnosis claims are reflections,
    // never durable medical beliefs. Hedged/joking consideration stays out of MRQ.
    const unsafeTherapyDiagnosis =
      isUnsafeTherapyDiagnosisClaim(claimText) || isUnsafeTherapyDiagnosisClaim(sourceText);

    const subject = resolveBeliefSubject({
      ...input,
      claimText,
      sourceText,
      storyGroupLabel: input.storyGroupLabel || String(input.metadata?.group_label ?? ''),
    });
    const domain = classifyBeliefDomain(claimText, speech.speechAct);
    const durability = classifyBeliefDurability({
      text: claimText,
      domain,
      speechAct: speech.speechAct,
    });
    const modality = resolveBeliefModality(claimText, speech.speechAct);
    const polarity = resolveBeliefPolarity(claimText);
    const attribution = resolveBeliefAttribution({
      text: claimText,
      domain,
      userId: input.userId,
    });
    const temporalScope = resolveBeliefTemporalScope({
      text: claimText,
      durability,
      now,
    });
    const sensitivity = resolveBeliefSensitivity({ text: claimText, domain });
    const semanticallyComplete = isSemanticallyCompleteBelief(claimText);

    const preliminaryRoute = routeBeliefOntology({
      speechAct: speech.speechAct,
      domain,
      durability,
      eligible: speech.beliefEligible,
    });

    const eligibility = evaluateBeliefEligibility({
      speechAct: speech.speechAct,
      subject,
      durability,
      semanticallyComplete,
      routingIsReject: preliminaryRoute === 'REJECT',
    });

    const routingTarget = routeBeliefOntology({
      speechAct: speech.speechAct,
      domain,
      durability,
      eligible: eligibility.eligible || ['EVENT_ONLY', 'TEMPORARY_STATE', 'PLAN_ONLY'].includes(durability),
    });

    const confidence = scoreConfidence({
      extraction: input.extractionConfidence ?? 0.6,
      speechAct: speech.confidence,
      subject: subject.confidence,
      durable: durability,
      eligible: eligibility.eligible,
      temporal: temporalScope.resolutionConfidence,
      attribution: attribution.status === 'ALLEGATION' ? 0.85 : 0.75,
    });

    const proposition = compileBeliefProposition({
      subject,
      domain,
      durability,
      modality,
      polarity,
      attribution,
      temporalScope,
      confidence,
      evidenceIds,
      sourceText,
      claimText,
      objectEntityId: typeof input.metadata?.object_entity_id === 'string'
        ? input.metadata.object_entity_id
        : undefined,
    });

    const fingerprint = buildPropositionFingerprint({ proposition, evidenceIds });
    const duplicate = resolveBeliefDuplicate({
      fingerprint,
      existingTexts: input.existingClaimTexts,
      renderedText: proposition.renderedText,
    });

    const correctionTarget = resolveBeliefCorrectionTarget({
      speechAct: speech.speechAct,
      claimText,
      existingClaimIds: input.existingClaimIds,
      existingClaimTexts: input.existingClaimTexts,
    });

    const { plan: mutationPlan, decision } = planBeliefMutation({
      speechAct: speech.speechAct,
      routingTarget,
      duplicateDecision: duplicate.decision,
      correctionTarget,
      proposition,
      evidenceIds,
      eligible: eligibility.eligible || decisionAllowsRoutedQueue(routingTarget, speech.beliefEligible),
    });

    // Harden: ineligible speech acts always reject when gate cares about noise
    const finalDecision = unsafeTherapyDiagnosis
      ? 'REJECT' as const
      : !speech.beliefEligible && routingTarget === 'REJECT'
        ? 'REJECT' as const
        : decision;

    const confirmationRequirement = resolveBeliefConfirmationRequirement({
      decision: finalDecision,
      mutation: mutationPlan.mutation,
      speechAct: speech.speechAct,
      routingTarget,
      sensitivity,
      correctionTarget,
    });

    const warnings: string[] = [];
    if (unsafeTherapyDiagnosis) {
      warnings.push('unsafe_therapy_diagnosis_claim');
    }
    if (subject.rejectedCandidates.length) {
      warnings.push('rejected_story_group_or_entity_as_subject');
    }
    if (
      (speech.speechAct === 'RETRACTION' || speech.speechAct === 'CORRECTION')
      && correctionTarget.matchMethod === 'UNRESOLVED'
    ) {
      warnings.push('unresolved_correction_target');
    }

    const diagnostic: BeliefDiagnosticTrace = {
      sourceText,
      claimText,
      speechAct: speech.speechAct,
      subject,
      rejectedSubjectCandidates: subject.rejectedCandidates,
      domain,
      durability,
      modality,
      routingTarget,
      duplicateDecision: duplicate.decision,
      correctionTarget,
      eligibility,
      confirmationRequirement,
      finalDecision,
      reasons: eligibility.reasons.length
        ? eligibility.reasons
        : [`decision:${finalDecision}`, `route:${routingTarget}`, speech.reason],
      warnings,
    };

    const result: BeliefCognitionResult = {
      speechAct: speech.speechAct,
      proposition,
      eligibility,
      routingTarget,
      decision: finalDecision,
      mutationPlan,
      confirmationRequirement,
      duplicateDecision: duplicate.decision,
      correctionTarget,
      sensitivity,
      fingerprint,
      diagnostic,
      proposalKindHint: 'durable_fact',
    };
    result.proposalKindHint = proposalKindHint(result);
    return result;
  }
}

function decisionAllowsRoutedQueue(
  routing: BeliefCognitionResult['routingTarget'],
  speechEligible: boolean,
): boolean {
  if (!speechEligible) return false;
  return ['EVENT', 'MOMENT', 'TEMPORAL_STATE', 'PLAN', 'TRUTH_STATE', 'RELATIONSHIP_GRAPH', 'ENTITY_REGISTRY', 'CORRECTION_QUEUE'].includes(routing);
}

function scoreConfidence(input: {
  extraction: number;
  speechAct: number;
  subject: number;
  durable: BeliefCognitionResult['proposition']['durability'];
  eligible: boolean;
  temporal: number;
  attribution: number;
}): BeliefConfidenceBreakdown {
  const durabilityConfidence = input.durable === 'DURABLE' ? 0.9
    : input.durable === 'SEMI_DURABLE' ? 0.75
      : input.durable === 'TEMPORARY_STATE' || input.durable === 'EVENT_ONLY' || input.durable === 'PLAN_ONLY' ? 0.7
        : 0.1;
  const overall = input.eligible
    ? clamp(
      (input.speechAct * 0.25)
      + (input.subject * 0.25)
      + (durabilityConfidence * 0.2)
      + (input.temporal * 0.1)
      + (input.attribution * 0.1)
      + (input.extraction * 0.1),
    )
    : 0;

  return {
    extractionConfidence: clamp(input.extraction),
    speechActConfidence: clamp(input.speechAct),
    subjectResolutionConfidence: clamp(input.subject),
    predicateConfidence: 0.7,
    objectResolutionConfidence: 0.6,
    autobiographicalRelevance: input.eligible ? 0.85 : 0.05,
    durabilityConfidence,
    temporalResolutionConfidence: clamp(input.temporal),
    attributionConfidence: clamp(input.attribution),
    duplicateResolutionConfidence: 0.7,
    sourceTrust: 0.8,
    overallEligibilityConfidence: overall,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export const beliefCognitionEngine = new BeliefCognitionEngine();

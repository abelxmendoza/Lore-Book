/**
 * Write-time suggestion acceptance — detection is not acceptance.
 *
 * Reuses entity quality gates, canonical classification, and domain arbitration.
 * Deterministic; no extra LLM.
 */

import { classifyEntity, isCharacterEligible } from '../../entities/entityClassifier';
import { inferNamedOrganizationForName } from '../../organizations/inference/namedOrganizationInference';
import { hasProjectSignal, hasQuestSignal, hasSkillSignal } from '../../conversationCentered/extractionSignals';
import { findSimilarExistingSkill } from '../../skills/skillSimilarityResolver';
import { goalCognitionEngine } from '../../goals/goalCognitionEngine';
import { hasRomanticSignals } from '../../ontology/romanticIntelligence';
import {
  evaluateEntityQuality,
  passesEntityQualityGate,
} from '../quality/entityQualityGateService';
import type { EntityQualityCandidate, EntityQualityContext, EntityQualityVerdict } from '../quality/entityQualityGuardTypes';
import { classifyInstitutionPlaceRole } from '../quality/institutionPlaceRole';
import { evaluateAttachEligibility } from './suggestionAttachEligibility';
import type { AttachCanonIndex, AttachDiagnostic } from './suggestionAttachTypes';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import type { OrganizationType } from '../../organizations/inference/organizationInferenceTypes';

export type SuggestionAcceptanceDecision =
  | 'VALID'
  | 'NEEDS_CONTEXT'
  | 'AMBIGUOUS_TYPE'
  | 'POSSIBLE_DUPLICATE'
  | 'REJECTED_NOISE'
  | 'ROUTED';

export type SuggestionAcceptanceResult = {
  accept: boolean;
  decision: SuggestionAcceptanceDecision;
  domain: LoreBookDomain;
  name: string;
  canonicalType?: string;
  organizationType?: OrganizationType;
  quality: EntityQualityVerdict;
  confidenceBefore: number;
  confidenceAfter: number;
  placeRole?: ReturnType<typeof classifyInstitutionPlaceRole>;
  duplicateOf?: string;
  attach?: AttachDiagnostic;
  reason: string;
};

export type SuggestionAcceptanceInput = EntityQualityCandidate & {
  qualityContext?: EntityQualityContext;
  knownSkillNames?: string[];
};

function calibrateConfidence(
  parsed: number,
  quality: EntityQualityVerdict,
  extras: { duplicate?: boolean; ambiguous?: boolean; visit?: boolean } = {},
): number {
  if (quality.gate === 'reject') return 0;
  let value = Math.min(quality.confidence || parsed, parsed);
  if (quality.requiresReview || extras.ambiguous) value = Math.min(value, 0.42);
  if (extras.duplicate) value = Math.min(value, 0.5);
  if (extras.visit) value = Math.max(value, 0.55);
  return Math.max(0, Math.min(0.95, value));
}

function canonIndexFromQualityContext(
  domain: LoreBookDomain,
  ctx?: EntityQualityContext,
): AttachCanonIndex {
  if (!ctx?.knownInBook?.size) return {};
  const records = [...ctx.knownInBook].map((label) => ({
    id: ctx.knownInBookIds?.get(normalizeNameKey(label)) ?? ctx.knownInBookIds?.get(label.toLowerCase()) ?? label,
    name: label,
    aliases: [] as string[],
    domain,
    userId: ctx.userId,
  }));
  return { [domain]: records };
}

export function evaluateSuggestionAcceptance(input: SuggestionAcceptanceInput): SuggestionAcceptanceResult {
  const name = input.name.trim();
  const evidence = [input.contextText, input.evidence].filter(Boolean).join(' ');
  const confidenceBefore = input.confidence ?? 0.7;
  const quality = evaluateEntityQuality(
    {
      name,
      domain: input.domain,
      contextText: evidence,
      evidence,
      confidence: confidenceBefore,
      spanType: input.spanType,
    },
    input.qualityContext ?? {},
  );

  const classification = classifyEntity(name, evidence);
  const namedOrg = inferNamedOrganizationForName(name, evidence);
  const attach = evaluateAttachEligibility({
    name,
    domain: input.domain,
    evidence,
    incomingType: namedOrg?.organizationType,
    sourceMessageId: input.sourceMessageId,
    userId: input.qualityContext?.userId,
    canon: canonIndexFromQualityContext(input.domain, input.qualityContext),
  });

  const base = {
    domain: input.domain,
    name,
    canonicalType: classification.type,
    quality,
    confidenceBefore,
    organizationType: namedOrg?.organizationType,
    attach,
  };

  if (!passesEntityQualityGate(quality)) {
    const placeRole = input.domain === 'locations' ? classifyInstitutionPlaceRole(name, evidence) : undefined;
    const duplicate = quality.rejectionReason?.startsWith('duplicate_canon');
    return {
      ...base,
      accept: false,
      decision: duplicate ? 'POSSIBLE_DUPLICATE' : 'REJECTED_NOISE',
      duplicateOf: quality.matchedCanonName,
      placeRole,
      confidenceAfter: 0,
      reason: quality.rejectionReason ?? 'quality_gate_reject',
    };
  }

  if (quality.redirectDomain && quality.redirectDomain !== input.domain) {
    return {
      ...base,
      accept: false,
      decision: 'ROUTED',
      confidenceAfter: 0,
      reason: quality.rejectionReason ?? `route_to_${quality.redirectDomain}`,
    };
  }

  if (input.domain === 'characters' && !isCharacterEligible(classification.type) && classification.type !== 'UNKNOWN') {
    return {
      ...base,
      accept: false,
      decision: 'REJECTED_NOISE',
      confidenceAfter: 0,
      reason: `canonical_type_conflict:${classification.type}`,
    };
  }

  if (input.domain === 'locations') {
    const placeRole = classifyInstitutionPlaceRole(name, evidence);
    if (placeRole === 'third_party') {
      return {
        ...base,
        accept: false,
        decision: 'REJECTED_NOISE',
        placeRole,
        confidenceAfter: 0,
        reason: 'third_party_institution_not_visit',
      };
    }
    const confidenceAfter = calibrateConfidence(confidenceBefore, quality, {
      visit: placeRole === 'protagonist_visit',
    });
    return {
      ...base,
      accept: true,
      decision: 'VALID',
      placeRole,
      confidenceAfter,
      reason: placeRole === 'protagonist_visit' ? 'protagonist_visit_place_projection' : 'quality_allow',
    };
  }

  if (input.domain === 'organizations' || input.domain === 'groups' || input.domain === 'schools') {
    const orgType = namedOrg?.organizationType
      ?? (/\buniversity|college\b/i.test(name) ? 'university' : undefined)
      ?? (/\bschool\b/i.test(name) ? 'school' : undefined);
    if (orgType === 'software' || classification.type === 'APP') {
      return {
        ...base,
        accept: true,
        decision: 'VALID',
        organizationType: 'software',
        confidenceAfter: calibrateConfidence(confidenceBefore, quality),
        reason: 'software_tool_labeled',
      };
    }
    const confidenceAfter = calibrateConfidence(confidenceBefore, quality, {
      ambiguous: !orgType || orgType === 'unknown_organization',
    });
    return {
      ...base,
      accept: true,
      decision: orgType ? 'VALID' : 'AMBIGUOUS_TYPE',
      organizationType: orgType ?? 'unknown_organization',
      confidenceAfter,
      reason: orgType === 'university' ? 'normalize_university' : 'quality_allow',
    };
  }

  if (input.domain === 'quests') {
    const cognition = goalCognitionEngine.evaluate({
      ownerEntityId: 'suggestion-gate',
      sourceText: evidence || name,
      proposedTitle: name,
      proposedKind: 'INTENTION',
      sourceType: 'chat',
      authorRole: 'user',
    });
    const kind = cognition.candidate.kind;
    const pastOrFragment =
      !cognition.eligibility.eligible ||
      kind === 'PAST_EVENT' ||
      kind === 'COMPLETED_ACTION' ||
      kind === 'NON_GOAL' ||
      kind === 'FEEDBACK';
    if (pastOrFragment || (!hasQuestSignal(evidence || name) && cognition.decision === 'REJECT')) {
      return {
        ...base,
        accept: false,
        decision: 'REJECTED_NOISE',
        confidenceAfter: 0,
        reason: cognition.eligibility.reasons[0] ?? 'fragment_no_goal',
      };
    }
  }

  if (input.domain === 'skills') {
    if (!hasSkillSignal(evidence) && !/\b(?:i (?:use|know|code(?:d)? in|write)|python|javascript|react)\b/i.test(evidence)) {
      return {
        ...base,
        accept: false,
        decision: 'REJECTED_NOISE',
        confidenceAfter: 0,
        reason: 'one_off_behavior_not_skill',
      };
    }
    const similar = findSimilarExistingSkill(
      name,
      (input.knownSkillNames ?? []).map((n) => ({ name: n })),
    );
    if (similar.match && similar.score >= 0.4) {
      return {
        ...base,
        accept: false,
        decision: 'POSSIBLE_DUPLICATE',
        duplicateOf: similar.match.name,
        confidenceAfter: calibrateConfidence(confidenceBefore, quality, { duplicate: true }),
        reason: `skill_dedupe:${similar.method}`,
      };
    }
  }

  if (input.domain === 'projects' && !hasProjectSignal(evidence) && !/^[A-Z][A-Za-z0-9.-]{2,}$/.test(name)) {
    return {
      ...base,
      accept: false,
      decision: 'REJECTED_NOISE',
      confidenceAfter: 0,
      reason: 'one_off_event_not_project',
    };
  }

  if (input.domain === 'relationships' && !hasRomanticSignals(evidence)) {
    return {
      ...base,
      accept: false,
      decision: 'REJECTED_NOISE',
      confidenceAfter: 0,
      reason: 'no_romantic_evidence',
    };
  }

  return {
    ...base,
    accept: true,
    decision: quality.requiresReview ? 'NEEDS_CONTEXT' : 'VALID',
    confidenceAfter: calibrateConfidence(confidenceBefore, quality),
    reason: 'quality_allow',
  };
}

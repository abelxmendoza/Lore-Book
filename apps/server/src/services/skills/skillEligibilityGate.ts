/**
 * Skill eligibility — is this a durable demonstrated capability for the user?
 */

import type {
  CapabilityEntityType,
  EvidenceRealityContext,
  SkillAgentResolution,
  SkillEvidenceStrength,
} from './skillCognitionTypes';
import { EVIDENCE_STRENGTH_WEIGHT } from './skillCognitionTypes';
import { entityTypeIsSkillBookEligible } from './capabilityOntologyRouter';
import { realityBlocksSkillCreation } from './skillContextClassifier';
import { subjectBlocksUserSkillBook } from './skillAgentResolver';

export type SkillEligibilityResult = {
  eligible: boolean;
  existenceConfidence: number;
  evidenceStrength: SkillEvidenceStrength;
  reasons: string[];
};

export function classifyEvidenceStrength(
  span: string,
  evidenceText: string,
  practiceEventCount = 1,
): SkillEvidenceStrength {
  const text = `${evidenceText || ''} ${span || ''}`;

  if (/\b(?:investigated|traced|fixed|shipped|deployed|built|implemented|debugged|diagnosed)\b/i.test(text)) {
    return practiceEventCount >= 2 ? 'REPEATED_PRACTICE' : 'DIRECT_DEMONSTRATION';
  }
  if (/\b(?:at\s+work|on\s+the\s+job|client|production|paid|salary|contractor)\b/i.test(text)) {
    return 'PROFESSIONAL_USE';
  }
  if (/\b(?:certified|certification|license|licensed)\b/i.test(text)) {
    return 'CERTIFICATION';
  }
  if (/\b(?:degree|master'?s|bachelor'?s|phd|studied|graduated|course|class)\b/i.test(text)) {
    return 'EDUCATION';
  }
  if (/\b(?:i\s+(?:know|can|am\s+good\s+at|trained|practice)|i'm\s+(?:skilled|experienced))\b/i.test(text)) {
    return 'SELF_REPORT';
  }
  if (/\b(?:seems|probably|might|maybe|heard|someone)\b/i.test(text)) {
    return 'INDIRECT_INFERENCE';
  }
  // Bare phrase / single noun mention
  if (!evidenceText || evidenceText.trim().length < 12 || evidenceText.trim().length < span.trim().length + 5) {
    return 'BARE_MENTION';
  }
  if (practiceEventCount >= 3) return 'REPEATED_PRACTICE';
  return 'SELF_REPORT';
}

export function evaluateSkillEligibility(input: {
  entityType: CapabilityEntityType;
  subject: SkillAgentResolution;
  realityContext: EvidenceRealityContext;
  evidenceStrength: SkillEvidenceStrength;
  userConfirmed?: boolean;
}): SkillEligibilityResult {
  const reasons: string[] = [];
  let eligible = true;

  if (input.userConfirmed && input.subject.subjectType === 'USER') {
    reasons.push('user_confirmed');
    return {
      eligible: true,
      existenceConfidence: 0.95,
      evidenceStrength: input.evidenceStrength,
      reasons,
    };
  }

  if (subjectBlocksUserSkillBook(input.subject)) {
    eligible = false;
    reasons.push('subject_not_user');
  }

  if (realityBlocksSkillCreation(input.realityContext)) {
    eligible = false;
    reasons.push(`reality_${input.realityContext.toLowerCase()}`);
  }

  if (input.realityContext === 'OTHER_PERSON') {
    eligible = false;
    reasons.push('other_person_context');
  }

  if (!entityTypeIsSkillBookEligible(input.entityType)) {
    eligible = false;
    reasons.push(`entity_type_${input.entityType}`);
  }

  if (input.evidenceStrength === 'BARE_MENTION' || input.evidenceStrength === 'INDIRECT_INFERENCE') {
    eligible = false;
    reasons.push(`weak_evidence_${input.evidenceStrength}`);
  }

  // Unresolved subject with only weak evidence → reject
  if (input.subject.subjectType === 'UNKNOWN' && input.evidenceStrength !== 'DIRECT_DEMONSTRATION') {
    eligible = false;
    reasons.push('unresolved_subject');
  }

  const weight = EVIDENCE_STRENGTH_WEIGHT[input.evidenceStrength];
  const ownershipBoost = input.subject.subjectType === 'USER' ? 0.15 : 0;
  const existenceConfidence = Math.max(
    0.05,
    Math.min(0.98, weight * 0.75 + ownershipBoost + (input.subject.confidence * 0.1)),
  );

  if (eligible) reasons.push('eligible_skill');

  return {
    eligible,
    existenceConfidence,
    evidenceStrength: input.evidenceStrength,
    reasons,
  };
}

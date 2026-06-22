import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferEmployerOrganizations } from './employerInference';
import { inferBootcampOrganizations } from './bootcampInference';
import { inferInvestorOrganizations } from './investorOrganizationInference';
import {
  inferNamedOrganizations,
  isBareGenericOrgWord,
} from './namedOrganizationInference';
import {
  disambiguateOrganizationFromPlace,
  looksLikeWorksiteNotEmployer,
} from './organizationPlaceDisambiguation';
import {
  disambiguateOrganizationFromProject,
  isCommunityNotOrganization,
  isProjectNotOrganization,
} from './organizationProjectDisambiguation';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToOrganizationCard,
  evaluateOrganizationPromotionStatus,
} from './organizationPromotionGate';
import {
  buildOrganizationContext,
  extractEvidencePhrases,
  hasProvenance,
} from './organizationProvenanceService';
import { inferSchoolInstitutions, isBareSchoolLabel } from './schoolInstitutionInference';
import { inferVendorPlatformOrganizations } from './vendorPlatformInference';
import type {
  OrganizationCandidate,
  OrganizationInferenceInput,
  OrganizationInferenceResult,
} from './organizationInferenceTypes';

function attachMessageMeta(
  candidates: OrganizationCandidate[],
  input: OrganizationInferenceInput,
): OrganizationCandidate[] {
  return candidates.map((c) => {
    const priorKey = normalizeNameKey(c.displayName);
    const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
    const boosted = boostConfidenceForRepeatedMentions(c.confidence, priorMentions);

    return {
      ...c,
      confidence: boosted,
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
      context: buildOrganizationContext(input.text, c.displayName, c.context),
      evidencePhrases:
        c.evidencePhrases.length > 0
          ? c.evidencePhrases
          : extractEvidencePhrases(input.text, c.displayName),
    };
  });
}

function dedupeOrganizations(candidates: OrganizationCandidate[]): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, candidate.confidence),
        organizationType:
          priorityType(existing.organizationType) >= priorityType(candidate.organizationType)
            ? existing.organizationType
            : candidate.organizationType,
        context: { ...existing.context, ...candidate.context },
        aliases: [...new Set([...existing.aliases, ...candidate.aliases])],
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        requiresReview: existing.requiresReview || candidate.requiresReview,
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function priorityType(type: OrganizationCandidate['organizationType']): number {
  const ranks: Record<OrganizationCandidate['organizationType'], number> = {
    employer: 10,
    school: 9,
    university: 9,
    bootcamp: 8,
    investor: 8,
    agency: 7,
    startup: 7,
    company: 6,
    platform: 5,
    vendor: 5,
    program: 4,
    client: 4,
    community_org: 2,
    unknown_organization: 1,
  };
  return ranks[type] ?? 1;
}

function applyWrongDomainGuard(
  candidate: OrganizationCandidate,
  knownDomains?: OrganizationInferenceInput['knownDomains'],
): OrganizationCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known === 'person' || known === 'event' || known === 'junk') return null;
  if (known === 'project' && candidate.organizationType !== 'employer') return null;
  if (known === 'group' && candidate.organizationType !== 'employer') return null;
  if (known === 'place' && looksLikeWorksiteNotEmployer(candidate.displayName, '')) return null;
  return candidate;
}

function finalizeCandidate(
  candidate: OrganizationCandidate,
  input: OrganizationInferenceInput,
): OrganizationCandidate {
  const priorKey = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
  const promotionStatus = evaluateOrganizationPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    priorMentions,
  });
  return { ...candidate, promotionStatus };
}

export class OrganizationInferenceService {
  inferFromMessage(input: OrganizationInferenceInput): OrganizationInferenceResult {
    const rejected: OrganizationInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    const raw = [
      ...inferNamedOrganizations(input.text),
      ...inferEmployerOrganizations(input.text),
      ...inferSchoolInstitutions(input.text),
      ...inferBootcampOrganizations(input.text),
      ...inferInvestorOrganizations(input.text),
      ...inferVendorPlatformOrganizations(input.text),
    ];

    let deduped = dedupeOrganizations(attachMessageMeta(raw, input));
    deduped = disambiguateOrganizationFromPlace(deduped, input.text);
    deduped = disambiguateOrganizationFromProject(deduped, input.text);

    const accepted: OrganizationCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericOrgWord(candidate.displayName) || isBareSchoolLabel(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_org' });
        continue;
      }

      if (isProjectNotOrganization(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'project_not_organization' });
        continue;
      }

      if (isCommunityNotOrganization(candidate.displayName, input.text)) {
        rejected.push({ displayName: candidate.displayName, reason: 'community_not_organization' });
        continue;
      }

      if (looksLikeWorksiteNotEmployer(candidate.displayName, input.text)) {
        rejected.push({ displayName: candidate.displayName, reason: 'worksite_not_employer' });
        continue;
      }

      const hasInstitutionalContext =
        candidate.context.roleToUser && candidate.context.roleToUser !== 'unknown'
          ? true
          : ['employer', 'school', 'university', 'bootcamp', 'investor', 'agency', 'platform', 'vendor', 'program'].includes(
              candidate.organizationType,
            );

      if (!hasInstitutionalContext && candidate.confidence < 0.9) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_institutional_context' });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.knownDomains);
      if (!guarded) {
        rejected.push({ displayName: candidate.displayName, reason: 'wrong_domain' });
        continue;
      }

      if (!hasProvenance(guarded)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    return { accepted, rejected };
  }

  canPromote(
    candidate: OrganizationCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToOrganizationCard(candidate, opts);
  }
}

export const organizationInferenceService = new OrganizationInferenceService();

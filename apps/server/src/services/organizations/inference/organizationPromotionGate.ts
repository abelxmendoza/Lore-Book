import type { OrganizationCandidate, OrganizationPromotionStatus } from './organizationInferenceTypes';

const INSTITUTIONAL_TYPES = new Set<OrganizationCandidate['organizationType']>([
  'employer',
  'school',
  'university',
  'bootcamp',
  'investor',
  'agency',
  'platform',
  'vendor',
  'program',
  'startup',
  'company',
]);

export function evaluateOrganizationPromotionStatus(
  candidate: OrganizationCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): OrganizationPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_organization';

  const mentionCount = opts.mentionCount ?? 1;
  const totalMentions = mentionCount + (opts.priorMentions ?? 0);
  const hasInstitutionalRole =
    Boolean(candidate.context.roleToUser && candidate.context.roleToUser !== 'unknown') ||
    INSTITUTIONAL_TYPES.has(candidate.organizationType);
  const hasLinkedContext = Boolean(
    candidate.context.personContext ||
      candidate.context.projectContext ||
      candidate.context.worksiteContext ||
      candidate.context.placeContext,
  );

  if (!hasInstitutionalRole) return 'mention_only';

  if (candidate.organizationType === 'investor' || candidate.requiresReview) {
    if (totalMentions >= 2 || opts.userConfirmed) return 'suggested_organization';
    return totalMentions >= 1 ? 'candidate' : 'mention_only';
  }

  if (totalMentions >= 3 && candidate.confidence >= 0.85) return 'suggested_organization';
  if (totalMentions >= 2 && hasLinkedContext) return 'suggested_organization';
  if (totalMentions >= 2 || (hasInstitutionalRole && candidate.confidence >= 0.88)) {
    return 'candidate';
  }

  return 'mention_only';
}

export function canPromoteToOrganizationCard(
  candidate: OrganizationCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateOrganizationPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
  return status === 'suggested_organization' || status === 'confirmed_organization';
}

export function boostConfidenceForRepeatedMentions(
  baseConfidence: number,
  priorMentions: number,
): number {
  return Math.min(0.98, baseConfidence + Math.min(0.2, priorMentions * 0.05));
}

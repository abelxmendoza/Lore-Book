import type { RelationshipCandidate, RelationshipPromotionStatus } from './relationshipInferenceTypes';

const REVIEW_FIRST_TYPES = new Set<RelationshipCandidate['relationshipType']>([
  'family',
  'romantic',
  'conflict',
]);

export function evaluateRelationshipPromotionStatus(
  candidate: RelationshipCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): RelationshipPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_relationship';

  const totalMentions = (opts.mentionCount ?? 1) + (opts.priorMentions ?? 0);
  const hasResolvedEndpoints =
    !candidate.subject.unresolved && !candidate.object.unresolved && Boolean(candidate.predicate);

  if (!hasResolvedEndpoints) return 'mention_only';

  if (candidate.requiresReview && !opts.userConfirmed && totalMentions < 2) {
    return totalMentions >= 1 ? 'candidate' : 'mention_only';
  }

  if (totalMentions >= 2 && candidate.confidence >= 0.85) return 'suggested_relationship';
  if (totalMentions >= 2 || candidate.confidence >= 0.9) return 'candidate';
  return 'mention_only';
}

export function canPromoteToRelationshipCard(
  candidate: RelationshipCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateRelationshipPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
  return status === 'suggested_relationship' || status === 'confirmed_relationship';
}

export function isReviewFirstType(type: RelationshipCandidate['relationshipType']): boolean {
  return REVIEW_FIRST_TYPES.has(type);
}

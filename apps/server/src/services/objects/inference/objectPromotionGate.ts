import type { ObjectCandidate, ObjectPromotionStatus } from './objectInferenceTypes';

const STRONG_RELATIONSHIPS = new Set<ObjectCandidate['context']['userRelationship']>([
  'owns',
  'lost',
  'fixed',
  'worked_on',
  'replaced',
]);

export function evaluateObjectPromotionStatus(
  candidate: ObjectCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): ObjectPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_object';

  const mentionCount = opts.mentionCount ?? 1;
  const totalMentions = mentionCount + (opts.priorMentions ?? 0);
  const hasStrongContext = Boolean(
    candidate.context.userRelationship && STRONG_RELATIONSHIPS.has(candidate.context.userRelationship),
  );

  if (candidate.requiresReview && !opts.userConfirmed && totalMentions < 2) {
    return hasStrongContext ? 'candidate' : 'mention_only';
  }

  if (totalMentions >= 3 || (hasStrongContext && totalMentions >= 2)) {
    return 'suggested_object';
  }

  if (totalMentions >= 2 || hasStrongContext || candidate.context.workContext) {
    return 'candidate';
  }

  return 'mention_only';
}

export function canPromoteToObjectCard(
  candidate: ObjectCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateObjectPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
  return status === 'suggested_object' || status === 'confirmed_object';
}

export function boostConfidenceForRepeatedMentions(
  baseConfidence: number,
  priorMentions: number,
  relationship?: ObjectCandidate['context']['userRelationship'],
): number {
  let boost = Math.min(0.2, priorMentions * 0.035);
  if (relationship && STRONG_RELATIONSHIPS.has(relationship)) boost += 0.08;
  return Math.min(0.98, baseConfidence + boost);
}

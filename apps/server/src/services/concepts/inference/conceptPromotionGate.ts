import type { ConceptCandidate, ConceptPromotionStatus } from './conceptInferenceTypes';

const NAMED_TYPES = new Set<ConceptCandidate['conceptType']>([
  'technical_concept',
  'product_concept',
  'mental_model',
]);

const REVIEW_FIRST_TYPES = new Set<ConceptCandidate['conceptType']>([
  'belief',
  'value',
  'theme',
  'identity_theme',
  'life_lesson',
  'philosophy',
  'fear_or_anxiety',
  'social_concept',
]);

export function evaluateConceptPromotionStatus(
  candidate: ConceptCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): ConceptPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_concept';

  const mentionCount = opts.mentionCount ?? 1;
  const totalMentions = mentionCount + (opts.priorMentions ?? 0);
  const hasProject = Boolean(candidate.context.projectContext);
  const repeated = candidate.context.repeatedTheme || totalMentions >= 2;

  if (NAMED_TYPES.has(candidate.conceptType) && (hasProject || totalMentions >= +2)) {
    return totalMentions >= 2 ? 'suggested_concept' : 'candidate';
  }

  if (REVIEW_FIRST_TYPES.has(candidate.conceptType)) {
    if (repeated && candidate.context.userStance) return 'suggested_concept';
    return totalMentions >= 2 ? 'candidate' : 'mention_only';
  }

  if (totalMentions >= 4 && candidate.confidence >= 0.8) return 'suggested_concept';
  if (totalMentions >= 2 || hasProject) return 'candidate';
  return 'mention_only';
}

export function canPromoteToConceptCard(
  candidate: ConceptCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateConceptPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
  return status === 'suggested_concept' || status === 'confirmed_concept';
}

export function boostConfidenceForRepeatedMentions(
  baseConfidence: number,
  priorMentions: number,
): number {
  return Math.min(0.98, baseConfidence + Math.min(0.22, priorMentions * 0.04));
}

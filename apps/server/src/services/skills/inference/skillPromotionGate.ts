import type { SkillCandidate, SkillPromotionStatus } from './skillInferenceTypes';

const NAMED_SKILL_TYPES = new Set<SkillCandidate['skillType']>([
  'martial_art',
  'programming_language',
  'software_tool',
  'robotics',
  'language',
  'technical',
  'creative',
  'hobby',
  'maintenance',
  'field_operations',
]);

export function evaluateSkillPromotionStatus(
  candidate: SkillCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): SkillPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_skill';

  const mentionCount = opts.mentionCount ?? 1;
  const totalMentions = mentionCount + (opts.priorMentions ?? 0);
  const hasLearningContext = Boolean(
    candidate.context.proficiencyHint ||
      candidate.context.activity ||
      candidate.context.hobbyOrPaid !== 'unknown',
  );

  if (NAMED_SKILL_TYPES.has(candidate.skillType) && candidate.confidence >= 0.85) {
    if (totalMentions >= 3 || (hasLearningContext && totalMentions >= 2)) {
      return 'suggested_skill';
    }
    return 'candidate';
  }

  if (candidate.context.hobbyOrPaid === 'paid' && hasLearningContext) {
    return totalMentions >= 2 ? 'suggested_skill' : 'candidate';
  }

  if (totalMentions >= 5 && candidate.confidence >= 0.75) return 'suggested_skill';
  if (totalMentions >= 3) return 'candidate';
  if (totalMentions >= 2 && hasLearningContext) return 'candidate';
  return 'mention_only';
}

export function canPromoteToSkillCard(
  candidate: SkillCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateSkillPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  return status === 'suggested_skill' || status === 'confirmed_skill';
}

export function boostConfidenceForRepeatedMentions(
  baseConfidence: number,
  priorMentions: number,
): number {
  const boost = Math.min(0.25, priorMentions * 0.04);
  return Math.min(0.98, baseConfidence + boost);
}

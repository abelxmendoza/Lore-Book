import type { QuestLogCandidate, QuestLogPromotionStatus } from './questLogInferenceTypes';

const ACTION_ITEM_TYPES = new Set<QuestLogCandidate['itemType']>([
  'quest',
  'goal',
  'task',
  'feature',
  'blocker',
  'habit',
  'milestone',
]);

export function evaluateQuestLogPromotionStatus(
  candidate: QuestLogCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    priorMentions?: number;
  } = {},
): QuestLogPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_quest_log_item';

  const mentionCount = opts.mentionCount ?? 1;
  const totalMentions = mentionCount + (opts.priorMentions ?? 0);
  const hasProject = Boolean(candidate.context.projectContext);
  const hasActionContext = ACTION_ITEM_TYPES.has(candidate.itemType);

  if (!hasActionContext) return 'mention_only';

  if (candidate.itemType === 'blocker') {
    return totalMentions >= 1 ? 'suggested_quest_log_item' : 'candidate';
  }

  if (totalMentions >= 3 && candidate.confidence >= 0.85) return 'suggested_quest_log_item';
  if (totalMentions >= 2 && (hasProject || candidate.context.lifeArea)) return 'suggested_quest_log_item';
  if (totalMentions >= 2 || candidate.confidence >= 0.88) return 'candidate';
  return 'mention_only';
}

export function canPromoteToQuestLogItem(
  candidate: QuestLogCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number } = {},
): boolean {
  const status = evaluateQuestLogPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  return status === 'suggested_quest_log_item' || status === 'confirmed_quest_log_item';
}

export function boostConfidenceForRepeatedMentions(
  baseConfidence: number,
  priorMentions: number,
): number {
  return Math.min(0.98, baseConfidence + Math.min(0.18, priorMentions * 0.04));
}

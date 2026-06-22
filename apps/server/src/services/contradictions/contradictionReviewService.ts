import type {
  ContradictionCandidate,
  ContradictionReviewAction,
  ContradictionReviewItem,
  ContradictionSeverity,
  SuggestedResolution,
} from './contradictionTypes';

const RESOLUTION_TO_ACTIONS: Record<SuggestedResolution, ContradictionReviewAction[]> = {
  keep_existing: ['keep_existing', 'reject_new_claim', 'ask_me_later'],
  replace_with_new: ['replace_with_new', 'keep_existing', 'ask_me_later'],
  split_entities: ['split_entities', 'keep_existing', 'reject_new_claim', 'ask_me_later'],
  merge_entities: ['merge_entities', 'split_entities', 'keep_existing', 'ask_me_later'],
  mark_time_bounded: ['add_time_boundary', 'mark_old_as_former', 'keep_existing', 'ask_me_later'],
  needs_user_review: [
    'keep_existing',
    'replace_with_new',
    'mark_old_as_former',
    'split_entities',
    'merge_entities',
    'add_time_boundary',
    'reject_new_claim',
    'ask_me_later',
  ],
};

const CRITICAL_TYPES = new Set(['identity', 'employment']);
const CRITICAL_SEVERITIES = new Set<ContradictionSeverity>(['critical']);

export function buildReviewItem(candidate: ContradictionCandidate): ContradictionReviewItem {
  const baseActions = RESOLUTION_TO_ACTIONS[candidate.suggestedResolution] ?? RESOLUTION_TO_ACTIONS.needs_user_review;
  const actions =
    CRITICAL_SEVERITIES.has(candidate.severity) || CRITICAL_TYPES.has(candidate.contradictionType)
      ? [...new Set<ContradictionReviewAction>([...baseActions])]
      : baseActions;

  return { candidate, availableActions: actions };
}

export function buildReviewQueue(candidates: ContradictionCandidate[]): ContradictionReviewItem[] {
  return candidates
    .filter((c) => c.requiresReview)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .map(buildReviewItem);
}

function severityRank(severity: ContradictionSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

export function requiresCriticalReview(candidate: ContradictionCandidate): boolean {
  return candidate.severity === 'critical' || CRITICAL_TYPES.has(candidate.contradictionType);
}

export function allReviewActions(): ContradictionReviewAction[] {
  return [
    'keep_existing',
    'replace_with_new',
    'mark_old_as_former',
    'split_entities',
    'merge_entities',
    'add_time_boundary',
    'reject_new_claim',
    'ask_me_later',
  ];
}

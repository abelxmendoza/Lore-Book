/** Quest Log inference — quests/goals/tasks are UI items, not Project Book cards. */

export type QuestLogItemType =
  | 'quest'
  | 'goal'
  | 'task'
  | 'milestone'
  | 'feature'
  | 'blocker'
  | 'habit'
  | 'reminder'
  | 'research_item';

export type QuestLogLifeArea =
  | 'career'
  | 'finance'
  | 'health'
  | 'relationships'
  | 'family'
  | 'school'
  | 'work'
  | 'product'
  | 'personal';

export type QuestLogStatusHint =
  | 'active'
  | 'paused'
  | 'done'
  | 'blocked'
  | 'planned'
  | 'unknown';

export type QuestLogPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_quest_log_item'
  | 'confirmed_quest_log_item';

export type QuestLogContext = {
  projectContext?: string;
  lifeArea?: QuestLogLifeArea;
  urgency?: 'now' | 'soon' | 'later' | 'unknown';
  statusHint?: QuestLogStatusHint;
  deadlineHint?: string;
  blockerReason?: string;
};

export type QuestLogCandidate = {
  displayName: string;
  itemType: QuestLogItemType;
  parentProjectId?: string;
  parentQuestId?: string;
  context: QuestLogContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: QuestLogPromotionStatus;
  rejectionReason?: string;
};

export type QuestLogInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  knownProjects?: Record<string, string>;
  knownDomains?: Record<string, 'person' | 'place' | 'event' | 'project' | 'organization' | 'group' | 'junk'>;
};

export type QuestLogInferenceResult = {
  accepted: QuestLogCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

/** Persistent Project Book entities — not Quest Log items by themselves. */
export const PROJECT_BOOK_ENTITIES = new Set([
  'lorebook',
  'lore book',
  'omega-1',
  'omega 1',
  'omega',
  'abeliciousness',
]);

/** Skill / ability inference from chat — candidate model before card promotion. */

export type SkillType =
  | 'martial_art'
  | 'programming_language'
  | 'software_tool'
  | 'robotics'
  | 'hardware'
  | 'field_operations'
  | 'maintenance'
  | 'language'
  | 'creative'
  | 'music'
  | 'cooking'
  | 'fitness'
  | 'technical'
  | 'social'
  | 'academic_subject'
  | 'hobby'
  | 'unknown_skill';

export type SkillPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_skill'
  | 'confirmed_skill';

export type SkillInferenceContext = {
  activity?: string;
  tool?: string;
  object?: string;
  organization?: string;
  project?: string;
  school?: string;
  group?: string;
  proficiencyHint?: string;
  frequencyHint?: string;
  currentOrFormer?: 'current' | 'former' | 'unknown';
  hobbyOrPaid?: 'hobby' | 'paid' | 'both' | 'unknown';
};

export type SkillCandidate = {
  displayName: string;
  skillType: SkillType;
  context: SkillInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: SkillPromotionStatus;
  rejectionReason?: string;
};

export type SkillInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  knownDomains?: Record<
    string,
    'person' | 'place' | 'event' | 'project' | 'organization' | 'skill' | 'group' | 'verb'
  >;
};

export type SkillInferenceResult = {
  accepted: SkillCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

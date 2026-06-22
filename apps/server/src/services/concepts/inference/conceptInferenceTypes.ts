/** Concept / idea inference from chat — candidate model before card promotion. */

export type ConceptType =
  | 'technical_concept'
  | 'product_concept'
  | 'belief'
  | 'value'
  | 'theme'
  | 'mental_model'
  | 'identity_theme'
  | 'life_lesson'
  | 'philosophy'
  | 'fear_or_anxiety'
  | 'goal_concept'
  | 'social_concept'
  | 'creative_concept'
  | 'unknown_concept';

export type ConceptPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_concept'
  | 'confirmed_concept';

export type UserStance = 'believes' | 'questions' | 'rejects' | 'explores' | 'wants' | 'fears';

export type ConceptInferenceContext = {
  userStance?: UserStance;
  projectContext?: string;
  emotionalContext?: string;
  repeatedTheme?: boolean;
  sourceDomain?: string;
};

export type ConceptCandidate = {
  displayName: string;
  conceptType: ConceptType;
  context: ConceptInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: ConceptPromotionStatus;
  rejectionReason?: string;
};

export type ConceptInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  knownDomains?: Record<
    string,
    'person' | 'place' | 'event' | 'project' | 'skill' | 'group' | 'object' | 'concept'
  >;
};

export type ConceptInferenceResult = {
  accepted: ConceptCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

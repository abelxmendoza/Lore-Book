/** Object / thing inference from chat — candidate model before card promotion. */

export type ObjectType =
  | 'personal_item'
  | 'device'
  | 'tool'
  | 'vehicle'
  | 'robot_part'
  | 'robot'
  | 'consumer_product'
  | 'work_equipment'
  | 'sports_gear'
  | 'music_gear'
  | 'clothing'
  | 'substance_or_consumable'
  | 'document'
  | 'unknown_object';

export type ObjectPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_object'
  | 'confirmed_object';

export type UserObjectRelationship =
  | 'owns'
  | 'lost'
  | 'borrowed'
  | 'used'
  | 'fixed'
  | 'worked_on'
  | 'wants'
  | 'replaced';

export type ObjectInferenceContext = {
  owner?: string;
  userRelationship?: UserObjectRelationship;
  placeContext?: string;
  eventContext?: string;
  workContext?: string;
  projectContext?: string;
  skillContext?: string;
  privacySensitive?: boolean;
};

export type ObjectCandidate = {
  displayName: string;
  objectType: ObjectType;
  context: ObjectInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: ObjectPromotionStatus;
  rejectionReason?: string;
  /** When object may also be a user-built project (e.g. Omega-1). */
  linkedProjectName?: string;
};

export type LostFoundEventHint = {
  objectDisplayName: string;
  eventType: 'lost_item' | 'recovered_item';
  placeContext?: string;
  evidence: string;
};

export type ObjectInferenceInput = {
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

export type ObjectInferenceResult = {
  accepted: ObjectCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
  lostFoundHints: LostFoundEventHint[];
  linkedSkillHints: string[];
};

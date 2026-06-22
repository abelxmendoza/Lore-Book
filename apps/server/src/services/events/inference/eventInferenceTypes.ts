/** Event inference from chat — candidate model before card promotion. */

export type EventType =
  | 'party'
  | 'graduation_party'
  | 'show'
  | 'concert'
  | 'music_event'
  | 'school_event'
  | 'work_event'
  | 'interview'
  | 'meeting'
  | 'conflict'
  | 'fight'
  | 'training'
  | 'travel'
  | 'trip'
  | 'recurring_activity'
  | 'social_encounter'
  | 'relationship_event'
  | 'family_event'
  | 'milestone'
  | 'unknown_event';

export type EventPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_event'
  | 'confirmed_event';

export type EntityRef = {
  displayName: string;
  entityId?: string;
};

export type EventTitleParts = {
  actor?: string;
  action?: string;
  object?: string;
  place?: string;
  time?: string;
  group?: string;
  honoree?: string;
};

export type EventInferenceContext = {
  people?: EntityRef[];
  place?: EntityRef;
  group?: EntityRef;
  organization?: EntityRef;
  timeHint?: string;
  emotionalWeight?: string;
  storyArc?: string;
};

export type EventCandidate = {
  displayName: string;
  eventType: EventType;
  titleParts?: EventTitleParts;
  context: EventInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  needsResolution: boolean;
  requiresReview: boolean;
  sensitive?: boolean;
  promotionStatus: EventPromotionStatus;
  rejectionReason?: string;
};

export type EventInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  knownDomains?: Record<
    string,
    'person' | 'place' | 'project' | 'skill' | 'group' | 'organization' | 'event' | 'object'
  >;
};

export type EventInferenceResult = {
  accepted: EventCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
  timeAnchors: string[];
};

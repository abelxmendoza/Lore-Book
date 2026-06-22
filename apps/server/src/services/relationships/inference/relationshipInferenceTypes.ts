/** Relationship inference from chat — candidate model before card promotion. */

export type RelationshipType =
  | 'family'
  | 'friendship'
  | 'romantic'
  | 'work'
  | 'school'
  | 'group_membership'
  | 'community_membership'
  | 'conflict'
  | 'mentor_student'
  | 'social_contact'
  | 'identity'
  | 'ownership'
  | 'event_participation'
  | 'unknown_relationship';

export type RelationshipDirection = 'subject_to_object' | 'bidirectional' | 'unclear';

export type TemporalStatus =
  | 'current'
  | 'past'
  | 'former'
  | 'dormant'
  | 'desired'
  | 'uncertain';

export type RelationshipPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_relationship'
  | 'confirmed_relationship';

export type EntityRef = {
  displayName: string;
  entityId?: string;
  unresolved?: boolean;
};

export type RelationshipInferenceContext = {
  eventContext?: string;
  placeContext?: string;
  groupContext?: string;
  organizationContext?: string;
  timeContext?: string;
  emotionalContext?: string;
};

export type RelationshipCandidate = {
  subject: EntityRef;
  predicate: string;
  object: EntityRef;
  relationshipType: RelationshipType;
  direction: RelationshipDirection;
  temporalStatus: TemporalStatus;
  context: RelationshipInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  sensitive?: boolean;
  promotionStatus: RelationshipPromotionStatus;
  rejectionReason?: string;
};

export type RelationshipInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  resolvedEntities?: Record<string, string>;
  knownDomains?: Record<string, 'person' | 'place' | 'event' | 'project' | 'organization' | 'group' | 'junk'>;
};

export type RelationshipInferenceResult = {
  accepted: RelationshipCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

export const USER_ENTITY: EntityRef = { displayName: 'user', entityId: 'user' };

/** Person / character inference from chat — candidate model before card promotion. */

export type CharacterIdentityType =
  | 'full_name'
  | 'partial_name'
  | 'nickname'
  | 'stage_name'
  | 'family_title_name'
  | 'honorific_name'
  | 'role_contextual'
  | 'ambiguous_contextual'
  | 'unnamed_reference';

export type CharacterPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_card'
  | 'confirmed_character';

export type CharacterTitleParts = {
  honorific?: string;
  familyTitle?: string;
  roleTitle?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  nickname?: string;
  contextualQualifier?: string;
};

export type CharacterInferenceContext = {
  storyContext?: string;
  eventContext?: string;
  placeContext?: string;
  groupContext?: string;
  organizationContext?: string;
  timeContext?: string;
  relationshipHint?: string;
  emotionalWeight?: string;
};

export type CharacterCandidate = {
  displayName: string;
  identityType: CharacterIdentityType;
  titleParts?: CharacterTitleParts;
  context: CharacterInferenceContext;
  aliases: string[];
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  needsResolution: boolean;
  requiresReview: boolean;
  promotionStatus: CharacterPromotionStatus;
  rejectionReason?: string;
};

export type CharacterInferenceInput = {
  text: string;
  sourceMessageId?: string;
  /** When assistant, inferred people are never promoted to cards. */
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  linkedPeople?: string[];
  knownDomains?: Record<string, 'person' | 'place' | 'event' | 'organization' | 'group' | 'project' | 'interest'>;
};

export type CharacterInferenceResult = {
  accepted: CharacterCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

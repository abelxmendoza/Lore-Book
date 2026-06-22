/** Place / location inference from chat — candidate model before card promotion. */

export type LocationType =
  | 'country'
  | 'state'
  | 'city'
  | 'neighborhood'
  | 'street'
  | 'private_residence'
  | 'family_home'
  | 'school'
  | 'university'
  | 'campus'
  | 'workplace'
  | 'worksite'
  | 'deployment_site'
  | 'store'
  | 'restaurant'
  | 'bar'
  | 'music_venue'
  | 'event_space'
  | 'gym'
  | 'dojo'
  | 'relative_location'
  | 'unknown_location';

export type LocationPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_location'
  | 'confirmed_location';

export type LocationInferenceContext = {
  eventContext?: string;
  personContext?: string;
  organizationContext?: string;
  groupContext?: string;
  timeContext?: string;
  privacySensitive?: boolean;
};

export type LocationCandidate = {
  displayName: string;
  locationType: LocationType;
  ownerEntityId?: string;
  ownerDisplayName?: string;
  context: LocationInferenceContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  needsResolution: boolean;
  requiresReview: boolean;
  promotionStatus: LocationPromotionStatus;
  rejectionReason?: string;
  /** Relative locations attach to a known anchor instead of becoming standalone cards. */
  anchorDisplayName?: string;
};

export type RelativeLocationAttachment = {
  phrase: string;
  anchorDisplayName?: string;
  sourceMessageId?: string;
};

export type LocationInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  knownPlaces?: Set<string>;
  knownDomains?: Record<
    string,
    'person' | 'project' | 'event' | 'skill' | 'relationship' | 'group' | 'organization' | 'place'
  >;
};

export type LocationInferenceResult = {
  accepted: LocationCandidate[];
  relativeAttachments: RelativeLocationAttachment[];
  rejected: Array<{ displayName: string; reason: string }>;
};

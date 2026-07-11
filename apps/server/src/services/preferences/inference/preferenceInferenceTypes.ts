/** Preference / taste / favorite inference — profile signals, not book cards. */

export type PreferenceType =
  | 'like'
  | 'dislike'
  | 'favorite'
  | 'taste'
  | 'aesthetic'
  | 'habit'
  | 'affinity'
  | 'avoidance'
  | 'value'
  | 'style'
  | 'unknown_preference';

export type PreferenceDomain =
  | 'music'
  | 'media'
  | 'food'
  | 'drink'
  | 'clothing'
  | 'technology'
  | 'robotics'
  | 'martial_arts'
  | 'language_learning'
  | 'social_scene'
  | 'aesthetic'
  | 'work'
  | 'product'
  | 'relationship'
  | 'place'
  | 'lifestyle'
  | 'unknown';

export type PreferenceStrength = 'weak' | 'medium' | 'strong' | 'favorite' | 'identity_level';

export type PreferenceAttachmentEntityType =
  | 'user_profile'
  | 'person'
  | 'place'
  | 'project'
  | 'skill'
  | 'group'
  | 'event'
  | 'narrative_anchor';

export type PreferenceAttachedTo = {
  entityType: PreferenceAttachmentEntityType;
  entityId?: string;
  inferredTitle?: string;
};

export type PreferenceTemporalStatus = 'current' | 'former' | 'uncertain';

export type PreferenceTemporal = {
  firstSeenAt?: string;
  lastSeenAt?: string;
  currentStatus: PreferenceTemporalStatus;
  evidenceCount: number;
};

export type PreferencePromotionStatus =
  | 'weak_signal'
  | 'candidate'
  | 'suggested_profile_memory'
  | 'confirmed_profile_memory';

/** Stable vs temporary vs goal vs identity — set by lifecycle classifier when known. */
export type PreferenceLifecycleKind =
  | 'temporary'
  | 'stable'
  | 'habit'
  | 'goal'
  | 'aspiration'
  | 'identity';

export type PreferenceSignal = {
  displayName: string;
  preferenceType: PreferenceType;
  domain: PreferenceDomain;
  strength: PreferenceStrength;
  attachedTo?: PreferenceAttachedTo;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  temporal: PreferenceTemporal;
  promotionStatus: PreferencePromotionStatus;
  /** Evidence-backed lifecycle; omit when unknown rather than guessing. */
  lifecycleKind?: PreferenceLifecycleKind;
};

export type PreferenceInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  priorMentionCounts?: Record<string, number>;
  userConfirmed?: boolean;
  knownProjects?: Record<string, string>;
  seenAt?: string;
};

export type PreferenceInferenceResult = {
  accepted: PreferenceSignal[];
  rejected: Array<{ displayName: string; reason: string }>;
};

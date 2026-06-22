/** Media / content / fandom inference — taste/context signals, not always book cards. */

export type MediaType =
  | 'movie'
  | 'show'
  | 'anime'
  | 'book'
  | 'song'
  | 'theme_song'
  | 'band'
  | 'artist'
  | 'music_genre'
  | 'fandom'
  | 'game'
  | 'content_creator'
  | 'youtube_channel'
  | 'podcast'
  | 'cultural_reference'
  | 'unknown_media';

export type MediaPreferenceSignal =
  | 'likes'
  | 'dislikes'
  | 'favorite'
  | 'inspired_by'
  | 'mentioned'
  | 'watched'
  | 'listened_to';

export type MediaPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_media'
  | 'confirmed_media';

export type MediaContext = {
  preferenceSignal?: MediaPreferenceSignal;
  eventContext?: string;
  sceneContext?: string;
  personContext?: string;
  projectContext?: string;
  aestheticContext?: string;
};

export type MediaCandidate = {
  displayName: string;
  mediaType: MediaType;
  context: MediaContext;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: MediaPromotionStatus;
  rejectionReason?: string;
};

export type MediaInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  knownCharacters?: Record<string, string>;
  knownDomains?: Record<string, 'person' | 'place' | 'event' | 'project' | 'organization' | 'group' | 'junk'>;
};

export type MediaInferenceResult = {
  accepted: MediaCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};

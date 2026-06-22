/** Emotion / sentiment / significance inference — metadata on story objects, not book cards. */

export type EmotionType =
  | 'anger'
  | 'sadness'
  | 'fear'
  | 'anxiety'
  | 'shame'
  | 'embarrassment'
  | 'rejection'
  | 'grief'
  | 'nostalgia'
  | 'pride'
  | 'joy'
  | 'excitement'
  | 'relief'
  | 'confusion'
  | 'resentment'
  | 'protectiveness'
  | 'romantic_interest'
  | 'longing'
  | 'confidence'
  | 'disappointment'
  | 'mixed';

export type Sentiment = 'positive' | 'negative' | 'mixed' | 'neutral';

export type EmotionIntensity = 'low' | 'medium' | 'high' | 'critical';

export type EmotionAttachmentEntityType =
  | 'person'
  | 'event'
  | 'relationship'
  | 'place'
  | 'project'
  | 'quest_log_item'
  | 'memory'
  | 'narrative_anchor';

export type NarrativeSignificanceType =
  | 'high_impact'
  | 'turning_point'
  | 'unresolved_wound'
  | 'meaningful_bond'
  | 'identity_shaping_memory'
  | 'recurring_pattern';

export type EmotionAttachedTo = {
  entityType: EmotionAttachmentEntityType;
  entityId?: string;
  inferredTitle?: string;
};

export type SignificanceMetadata = {
  significanceType: NarrativeSignificanceType;
  evidencePhrases: string[];
  emotionalWeight: number;
  attachedTo?: EmotionAttachedTo;
};

export type EmotionSignal = {
  emotionType: EmotionType;
  sentiment: Sentiment;
  intensity: EmotionIntensity;
  attachedTo: EmotionAttachedTo;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: true;
  requiresReview: boolean;
  significance?: SignificanceMetadata;
  arcPhase?: string;
  emotionalWeight?: number;
};

export type EmotionInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  knownEntities?: Record<
    string,
    { entityType: EmotionAttachmentEntityType; entityId?: string; inferredTitle?: string }
  >;
  priorArcPhases?: Record<string, EmotionType[]>;
};

export type EmotionInferenceResult = {
  accepted: EmotionSignal[];
  rejected: Array<{ reason: string; emotionType?: EmotionType }>;
  significance: SignificanceMetadata[];
};

/** Emotion labels that must never become standalone book cards. */
export const STANDALONE_EMOTION_LABELS = new Set([
  'rejection',
  'anger',
  'sadness',
  'fear',
  'anxiety',
  'joy',
  'pride',
  'excitement',
  'embarrassment',
  'shame',
  'grief',
  'nostalgia',
  'relief',
  'confusion',
  'disappointment',
  'longing',
  'mixed',
]);

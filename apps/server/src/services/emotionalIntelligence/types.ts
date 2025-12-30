/**
 * Emotional Intelligence Engine Type Definitions
 */

export type EmotionType =
  | 'anger'
  | 'fear'
  | 'sadness'
  | 'shame'
  | 'guilt'
  | 'joy'
  | 'pride'
  | 'love'
  | 'disgust'
  | 'surprise'
  | 'anxiety';

export interface EmotionalEvent {
  id?: string;
  emotion: EmotionType;
  intensity: number; // 1-10
  trigger?: string;
  context?: {
    people?: string[];
    places?: string[];
    themes?: string[];
  };
  behaviorResponse?: string;
  regulationStrategy?: string;
  entry_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface EmotionalPatternSummary {
  id?: string;
  dominantEmotions: EmotionType[];
  recurringTriggers: string[];
  reactionLoops: Record<string, any>;
  recoverySpeed: number; // hours
  volatilityScore: number; // 0-1
  emotionalBiases: Record<string, any>;
  user_id?: string;
  updated_at?: string;
}

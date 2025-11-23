/**
 * Emotion Resolution Engine Type Definitions
 */

export interface RawEmotionSignal {
  memoryId: string;
  text: string;
  timestamp: string;
}

export interface EmotionEventResolved {
  id?: string;
  emotion: string;
  subtype: string | null;
  intensity: number; // 0-1
  polarity: 'positive' | 'negative' | 'neutral';
  triggers: string[];
  embedding?: number[];
  startTime: string;
  endTime: string;
  confidence: number;
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EmotionClassification {
  emotion: string;
  subtype: string | null;
  polarity: 'positive' | 'negative' | 'neutral';
  triggers?: string[];
}

export interface EmotionMention {
  id?: string;
  emotion_id: string;
  memory_id: string;
  evidence?: string;
  created_at?: string;
}


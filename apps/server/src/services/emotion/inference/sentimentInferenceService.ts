import type { EmotionType, Sentiment } from './emotionInferenceTypes';

const POSITIVE_EMOTIONS = new Set<EmotionType>([
  'joy',
  'excitement',
  'pride',
  'relief',
  'confidence',
  'protectiveness',
  'nostalgia',
  'romantic_interest',
]);

const NEGATIVE_EMOTIONS = new Set<EmotionType>([
  'anger',
  'sadness',
  'fear',
  'anxiety',
  'shame',
  'embarrassment',
  'rejection',
  'grief',
  'confusion',
  'resentment',
  'disappointment',
  'longing',
]);

export function inferSentimentForEmotion(emotionType: EmotionType): Sentiment {
  if (emotionType === 'mixed') return 'mixed';
  if (POSITIVE_EMOTIONS.has(emotionType)) return 'positive';
  if (NEGATIVE_EMOTIONS.has(emotionType)) return 'negative';
  return 'neutral';
}

export function inferSentimentFromText(text: string, emotions: EmotionType[]): Sentiment {
  if (emotions.length === 0) return 'neutral';
  if (emotions.length > 1) {
    const sentiments = new Set(emotions.map(inferSentimentForEmotion));
    if (sentiments.has('positive') && sentiments.has('negative')) return 'mixed';
  }
  if (/\b(?:but|however|though)\b/i.test(text) && emotions.length >= 2) return 'mixed';
  return inferSentimentForEmotion(emotions[0]);
}

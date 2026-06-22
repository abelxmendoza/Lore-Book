import type { EmotionSignal, EmotionType } from './emotionInferenceTypes';
import {
  attachEmotionToNearestTarget,
  splitMixedEmotionClauses,
} from './emotionAttachmentService';
import { boostConfidenceForWeight, inferIntensityFromWeight, scoreEmotionalWeight } from './emotionalWeightScorer';
import { inferSentimentForEmotion } from './sentimentInferenceService';

const EXPLICIT_PATTERNS: Array<{ re: RegExp; emotionType: EmotionType; confidence: number }> = [
  { re: /\bI felt rejected\b/i, emotionType: 'rejection', confidence: 0.92 },
  { re: /\bI was mad\b/i, emotionType: 'anger', confidence: 0.9 },
  { re: /\bI was scared\b/i, emotionType: 'fear', confidence: 0.9 },
  { re: /\bI'?m proud\b/i, emotionType: 'pride', confidence: 0.9 },
  { re: /\bI feel embarrassed\b/i, emotionType: 'embarrassment', confidence: 0.9 },
  { re: /\bI was excited\b/i, emotionType: 'excitement', confidence: 0.88 },
  { re: /\bI felt lonely\b/i, emotionType: 'sadness', confidence: 0.86 },
  { re: /\bI was anxious\b/i, emotionType: 'anxiety', confidence: 0.88 },
  { re: /\bI felt hurt\b/i, emotionType: 'sadness', confidence: 0.88 },
];

const IMPLIED_PATTERNS: Array<{ re: RegExp; emotions: EmotionType[]; confidence: number }> = [
  { re: /\bghosted me\b/i, emotions: ['rejection', 'sadness'], confidence: 0.8 },
  { re: /\bblocked me\b/i, emotions: ['rejection', 'anger'], confidence: 0.78 },
  { re: /\bpeople wanted to jump me\b/i, emotions: ['fear', 'anxiety'], confidence: 0.82 },
  { re: /\bgot the homie out\b/i, emotions: ['protectiveness', 'relief'], confidence: 0.76 },
  { re: /\bblacked out\b/i, emotions: ['confusion', 'shame'], confidence: 0.74 },
  { re: /\bgot (?:an? )?offer\b/i, emotions: ['pride', 'relief'], confidence: 0.84 },
  { re: /\bmissed my birthday\b/i, emotions: ['disappointment', 'sadness'], confidence: 0.8 },
  { re: /\bnever had (?:friends|another friend) like him\b/i, emotions: ['nostalgia', 'longing'], confidence: 0.86 },
  { re: /\b(?:mad|pissed)\b/i, emotions: ['anger'], confidence: 0.72 },
  { re: /\bexcited about\b/i, emotions: ['excitement'], confidence: 0.8 },
];

function makeSignal(
  emotionType: EmotionType,
  text: string,
  clause: string,
  evidence: string,
  confidence: number,
  knownEntities?: Parameters<typeof attachEmotionToNearestTarget>[2],
): EmotionSignal {
  const weight = scoreEmotionalWeight(clause || text);
  return {
    emotionType,
    sentiment: inferSentimentForEmotion(emotionType),
    intensity: inferIntensityFromWeight(weight, clause || text),
    attachedTo: attachEmotionToNearestTarget(text, clause || evidence, knownEntities),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: boostConfidenceForWeight(confidence, weight),
    inferredNotConfirmed: true,
    requiresReview: false,
    emotionalWeight: weight,
  };
}

export function inferExplicitEmotions(
  text: string,
  knownEntities?: Parameters<typeof attachEmotionToNearestTarget>[2],
): EmotionSignal[] {
  const out: EmotionSignal[] = [];
  for (const { re, emotionType, confidence } of EXPLICIT_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    out.push(makeSignal(emotionType, text, text, match[0], confidence, knownEntities));
  }
  return out;
}

export function inferImpliedEmotions(
  text: string,
  knownEntities?: Parameters<typeof attachEmotionToNearestTarget>[2],
): EmotionSignal[] {
  const out: EmotionSignal[] = [];
  for (const clause of splitMixedEmotionClauses(text)) {
    for (const { re, emotions, confidence } of IMPLIED_PATTERNS) {
      const match = re.exec(clause);
      if (!match) continue;
      for (const emotionType of emotions) {
        out.push(makeSignal(emotionType, text, clause, match[0], confidence * 0.95, knownEntities));
      }
    }
  }
  return out;
}

export function inferAllEmotionSignals(
  text: string,
  knownEntities?: Parameters<typeof attachEmotionToNearestTarget>[2],
): EmotionSignal[] {
  return [...inferExplicitEmotions(text, knownEntities), ...inferImpliedEmotions(text, knownEntities)];
}

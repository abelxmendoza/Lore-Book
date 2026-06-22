import type { EmotionIntensity } from './emotionInferenceTypes';

/** High-weight phrases boost narrative retrieval importance — not truth claims. */
export const HIGH_WEIGHT_PHRASES = [
  'best friend',
  'never had friends like him',
  'never had another friend like him',
  'ghosted',
  'blocked',
  'humiliated',
  'scared',
  'proud',
  'love',
  'hate',
  'betrayal',
  'birthday',
  'fight',
  'got kicked out',
  'got offer',
  'blacked out',
  'changed everything',
  'never forgot',
  'first time',
  'biggest',
  'main thing',
  'important to me',
  'i still think about',
  'people wanted to jump me',
  'missed my birthday',
];

export function scoreEmotionalWeight(text: string): number {
  const lower = text.toLowerCase();
  let score = 0.2;
  for (const phrase of HIGH_WEIGHT_PHRASES) {
    if (lower.includes(phrase)) score += 0.12;
  }
  const exclamations = (text.match(/!/g) ?? []).length;
  score += Math.min(0.15, exclamations * 0.04);
  return Math.min(1, score);
}

export function inferIntensityFromWeight(weight: number, text: string): EmotionIntensity {
  if (/\b(?:critical|terrified|devastated|never forget|changed everything)\b/i.test(text)) {
    return 'critical';
  }
  if (weight >= 0.65 || /\b(?:so (?:mad|scared|proud|excited)|really (?:hurt|angry))\b/i.test(text)) {
    return 'high';
  }
  if (weight >= 0.35 || /\b(?:a bit|kind of|slightly)\b/i.test(text)) {
    return 'medium';
  }
  return weight >= 0.25 ? 'medium' : 'low';
}

export function boostConfidenceForWeight(baseConfidence: number, weight: number): number {
  return Math.min(0.98, baseConfidence + weight * 0.12);
}

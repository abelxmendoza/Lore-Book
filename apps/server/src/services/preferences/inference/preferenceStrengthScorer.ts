import type { PreferenceStrength } from './preferenceInferenceTypes';

const IDENTITY_PHRASES = [
  'main thing',
  'my main thing',
  'who i am',
  'part of me',
  'identity',
  'always been',
];

const FAVORITE_PHRASES = ['favorite', 'favourite', 'my favorite', 'my favourite', 'obsessed', "can't stop"];

const STRONG_PHRASES = ['love', 'hate', 'always', 'all the time', 'every weekend', 'every night'];

export function scoreStrengthFromText(text: string, preferenceType: string): PreferenceStrength {
  const lower = text.toLowerCase();
  if (IDENTITY_PHRASES.some((p) => lower.includes(p))) return 'identity_level';
  if (preferenceType === 'favorite' || FAVORITE_PHRASES.some((p) => lower.includes(p))) return 'favorite';
  if (STRONG_PHRASES.some((p) => lower.includes(p))) return 'strong';
  if (/\b(?:prefer|usually|often|into)\b/i.test(text)) return 'medium';
  return 'weak';
}

export function boostConfidenceForStrength(baseConfidence: number, strength: PreferenceStrength): number {
  const boost: Record<PreferenceStrength, number> = {
    weak: 0,
    medium: 0.04,
    strong: 0.08,
    favorite: 0.12,
    identity_level: 0.16,
  };
  return Math.min(0.98, baseConfidence + boost[strength]);
}

export function strengthFromMentionCount(mentionCount: number): PreferenceStrength {
  if (mentionCount >= 4) return 'strong';
  if (mentionCount >= 2) return 'medium';
  return 'weak';
}

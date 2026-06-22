import type { MediaCandidate } from './mediaInferenceTypes';
import { inferPreferenceSignal } from './mediaProvenanceService';

const NAMED_WORKS: Array<{
  pattern: RegExp;
  displayName: string;
  mediaType: MediaCandidate['mediaType'];
  confidence: number;
}> = [
  { pattern: /\bOne Piece\b/i, displayName: 'One Piece', mediaType: 'anime', confidence: 0.92 },
  { pattern: /\bStar Wars\b/i, displayName: 'Star Wars', mediaType: 'cultural_reference', confidence: 0.9 },
  { pattern: /\bBlade Runner\b/i, displayName: 'Blade Runner', mediaType: 'movie', confidence: 0.9 },
  { pattern: /\bHarry Potter\b/i, displayName: 'Harry Potter', mediaType: 'book', confidence: 0.9 },
  {
    pattern: /\bHedwig'?s Theme\b/i,
    displayName: "Hedwig's Theme",
    mediaType: 'theme_song',
    confidence: 0.88,
  },
];

export function inferMediaWorks(text: string): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const pref = inferPreferenceSignal(text);

  for (const { pattern, displayName, mediaType, confidence } of NAMED_WORKS) {
    const match = pattern.exec(text);
    if (!match) continue;
    out.push({
      displayName,
      mediaType,
      context: {
        preferenceSignal: pref,
        aestheticContext: /\b(?:vibe|aesthetic|theme|like|inspired)\b/i.test(text)
          ? displayName
          : undefined,
        projectContext: /\bLoreBook\b/i.test(text) ? 'LoreBook' : undefined,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence,
      inferredNotConfirmed: pref === 'mentioned',
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

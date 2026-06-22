import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { MediaCandidate } from './mediaInferenceTypes';
import { inferPreferenceSignal } from './mediaProvenanceService';

const GENRE_PATTERNS: Array<{ re: RegExp; displayName: string; asFandom?: boolean }> = [
  { re: /\bska\b/i, displayName: 'ska' },
  { re: /\bpunk\b/i, displayName: 'punk' },
  { re: /\bmetal\b/i, displayName: 'metal' },
  { re: /\bgoth(?:ic)?\b/i, displayName: 'goth' },
  { re: /\banime\b/i, displayName: 'anime', asFandom: true },
  { re: /\bsci-fi\b/i, displayName: 'sci-fi', asFandom: true },
  { re: /\bfantasy\b/i, displayName: 'fantasy', asFandom: true },
  { re: /\bcyberpunk\b/i, displayName: 'cyberpunk', asFandom: true },
  { re: /\bhorror\b/i, displayName: 'horror', asFandom: true },
];

export function inferGenreFandoms(text: string): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const pref = inferPreferenceSignal(text);

  for (const { re, displayName, asFandom } of GENRE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      mediaType: asFandom ? 'fandom' : 'music_genre',
      context: {
        preferenceSignal: pref,
        sceneContext: /\b(?:shows?|scene|community|prom)\b/i.test(text) ? 'live music scene' : undefined,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: pref !== 'mentioned' ? 0.84 : 0.72,
      inferredNotConfirmed: pref === 'mentioned',
      requiresReview: false,
      promotionStatus: pref !== 'mentioned' ? 'candidate' : 'mention_only',
    });
  }

  return out;
}

import type { MediaCandidate } from './mediaInferenceTypes';
import { inferPreferenceSignal } from './mediaProvenanceService';

const CONTENT_CREATORS: Array<{ pattern: RegExp; displayName: string; mediaType: MediaCandidate['mediaType'] }> = [
  { pattern: /\bRafeh Qazi\b/i, displayName: 'Rafeh Qazi', mediaType: 'content_creator' },
  {
    pattern: /\bClever Programmer(?:\s+YouTube(?:\s+channel)?)?\b/i,
    displayName: 'Clever Programmer',
    mediaType: 'youtube_channel',
  },
];

export function inferContentCreators(text: string): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const pref = inferPreferenceSignal(text);

  if (/\bClever Programmer Bootcamp\b/i.test(text)) {
    return out;
  }

  for (const { pattern, displayName, mediaType } of CONTENT_CREATORS) {
    const match = pattern.exec(text);
    if (!match) continue;

    const isYouTuber = /\b(?:YouTuber|YouTube|channel|creator)\b/i.test(text);
    out.push({
      displayName,
      mediaType: isYouTuber || mediaType === 'youtube_channel' ? mediaType : 'content_creator',
      context: {
        preferenceSignal: pref,
        personContext: displayName === 'Rafeh Qazi' ? 'content creator / person' : undefined,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: isYouTuber ? 0.9 : 0.84,
      inferredNotConfirmed: !isYouTuber,
      requiresReview: false,
      promotionStatus: isYouTuber ? 'candidate' : 'mention_only',
    });
  }

  return out;
}

export function isEducationOrgNotMedia(text: string, displayName: string): boolean {
  if (!/Clever Programmer/i.test(displayName)) return false;
  return /\b(?:Bootcamp|enrolled|school|program)\b/i.test(text);
}

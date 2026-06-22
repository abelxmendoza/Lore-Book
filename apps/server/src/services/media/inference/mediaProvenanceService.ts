import type { MediaCandidate } from './mediaInferenceTypes';

export function extractEvidencePhrases(text: string, span?: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (!span) return sentences.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function hasProvenance(candidate: MediaCandidate): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(candidate.displayName.trim())
  );
}

export function inferPreferenceSignal(text: string): MediaCandidate['context']['preferenceSignal'] {
  if (/\b(?:I love|my favorite|favorite)\b/i.test(text)) return 'favorite';
  if (/\b(?:I like|I'?m into|vibes with)\b/i.test(text)) return 'likes';
  if (/\b(?:I hate|don'?t like|not into)\b/i.test(text)) return 'dislikes';
  if (/\b(?:inspired by|reminds me of|something like)\b/i.test(text)) return 'inspired_by';
  if (/\b(?:watched|watching|binge)\b/i.test(text)) return 'watched';
  if (/\b(?:listened|listening|played)\b/i.test(text)) return 'listened_to';
  return 'mentioned';
}

export function shouldCreateStandaloneMediaCard(candidate: MediaCandidate): boolean {
  return candidate.promotionStatus === 'suggested_media' || candidate.promotionStatus === 'confirmed_media';
}

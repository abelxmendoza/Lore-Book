import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LocationCandidate, RelativeLocationAttachment } from './locationInferenceTypes';

const RELATIVE_PHRASES = [
  'around the corner',
  'over there',
  'right there',
  'nearby',
  'close by',
  'down the street',
  'up the street',
  'across the street',
];

const RELATIVE_SINGLE = new Set(['there', 'here']);

export function detectRelativePhrases(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const phrase of RELATIVE_PHRASES) {
    if (lower.includes(phrase)) found.push(phrase);
  }

  for (const word of RELATIVE_SINGLE) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) found.push(word);
  }

  return [...new Set(found)];
}

export function resolveRelativeAttachments(
  text: string,
  knownAnchors: LocationCandidate[],
  sourceMessageId?: string,
): RelativeLocationAttachment[] {
  const phrases = detectRelativePhrases(text);
  if (phrases.length === 0) return [];

  const anchor = pickNearestAnchor(text, knownAnchors);
  return phrases.map((phrase) => ({
    phrase,
    anchorDisplayName: anchor?.displayName,
    sourceMessageId,
  }));
}

function pickNearestAnchor(
  text: string,
  anchors: LocationCandidate[],
): LocationCandidate | undefined {
  if (anchors.length === 0) return undefined;

  let best: LocationCandidate | undefined;
  let bestIdx = -1;

  for (const anchor of anchors) {
    const idx = text.toLowerCase().lastIndexOf(anchor.displayName.toLowerCase());
    if (idx > bestIdx) {
      bestIdx = idx;
      best = anchor;
    }
  }

  return best ?? anchors[0];
}

/** Relative locations never become standalone promoted cards. */
export function toRelativeLocationCandidate(
  phrase: string,
  anchor?: LocationCandidate,
): LocationCandidate {
  return {
    displayName: phrase,
    locationType: 'relative_location',
    anchorDisplayName: anchor?.displayName,
    context: {},
    evidencePhrases: [phrase],
    sourceMessageIds: [],
    confidence: 0.4,
    needsResolution: true,
    requiresReview: false,
    promotionStatus: 'mention_only',
  };
}

export function isRelativeOnlySpan(name: string): boolean {
  const key = normalizeNameKey(name);
  return RELATIVE_SINGLE.has(key) || RELATIVE_PHRASES.includes(key);
}

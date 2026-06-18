/**
 * Detect AI/epistemic uncertainty markers in text.
 *
 * Pure and dependency-free so the ingestion pipeline's uncertainty heuristic can
 * be unit-tested directly. Used to flag when an AI turn is hedging/assuming so
 * downstream extraction can down-weight its claims.
 */

export type UncertaintyResult = {
  uncertainty_markers: string[];
  context_quality: 'high' | 'medium' | 'low';
};

// Ordered longest-first so multi-word markers ("seems like") are detected and
// the single-word substrings they contain don't double-count misleadingly.
const UNCERTAINTY_WORDS = [
  'might be',
  'seems like',
  'appears to',
  'looks like',
  'sounds like',
  'i think',
  'i believe',
  'i assume',
  'i guess',
  'not sure',
  'might',
  'possibly',
  'seems',
  'appears',
  'likely',
  'probably',
  'perhaps',
  'maybe',
  'could',
  'may',
  'unclear',
  'uncertain',
] as const;

const WORD_BOUNDARY = /[a-z]/i;

/**
 * Returns true when `marker` occurs in `lowerText` as a standalone token rather
 * than embedded inside a larger word (so "may" does not match "maybe"/"mayor").
 */
function containsMarker(lowerText: string, marker: string): boolean {
  let from = 0;
  for (;;) {
    const idx = lowerText.indexOf(marker, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : lowerText[idx - 1];
    const afterIdx = idx + marker.length;
    const after = afterIdx >= lowerText.length ? '' : lowerText[afterIdx];
    const boundedBefore = !WORD_BOUNDARY.test(before);
    const boundedAfter = !WORD_BOUNDARY.test(after);
    if (boundedBefore && boundedAfter) return true;
    from = idx + 1;
  }
}

export function detectAIUncertainty(text: string): UncertaintyResult {
  const lowerText = (text ?? '').toLowerCase();
  const foundMarkers: string[] = [];

  for (const word of UNCERTAINTY_WORDS) {
    if (containsMarker(lowerText, word)) {
      foundMarkers.push(word);
    }
  }

  let contextQuality: 'high' | 'medium' | 'low' = 'high';
  if (foundMarkers.length >= 3) {
    contextQuality = 'low';
  } else if (foundMarkers.length >= 1) {
    contextQuality = 'medium';
  }

  return { uncertainty_markers: foundMarkers, context_quality: contextQuality };
}

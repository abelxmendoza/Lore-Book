import { normalizeNameKey } from '../../utils/nameNormalization';
import type { PlaceCognitionResult } from './placeTypes';

/**
 * Collapse alias variants into one cognition result (prefer ACCEPT/MERGE over REVIEW).
 */
export function dedupePlaceCognitionResults(
  results: PlaceCognitionResult[],
): PlaceCognitionResult[] {
  const byKey = new Map<string, PlaceCognitionResult>();

  for (const result of results) {
    if (result.decision === 'REJECT') continue;
    const key = normalizeNameKey(result.canonicalTitle);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, result);
      continue;
    }
    byKey.set(key, prefer(existing, result));
  }

  return [...byKey.values()];
}

function prefer(a: PlaceCognitionResult, b: PlaceCognitionResult): PlaceCognitionResult {
  const rank = (r: PlaceCognitionResult) => {
    if (r.decision === 'MERGE_EXISTING') return 4;
    if (r.decision === 'ACCEPT') return 3;
    if (r.decision === 'REVIEW') return 2;
    if (r.decision === 'HOLD_GENERIC') return 1;
    return 0;
  };
  if (rank(b) !== rank(a)) return rank(b) > rank(a) ? b : a;
  return b.confidence >= a.confidence ? b : a;
}

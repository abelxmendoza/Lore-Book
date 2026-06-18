import { AI_THRESHOLDS } from '../../config/aiThresholds';
import { jaroWinkler } from '../../utils/jaroWinkler';

/**
 * Fuzzy string matching for entity/event/location dedupe.
 * Uses the shared Jaro-Winkler util (see config/aiThresholds.ts).
 */
export class FuzzyMatcher {
  similarity(a: string, b: string): number {
    return jaroWinkler(a, b);
  }

  isDuplicate(a: string, b: string): boolean {
    return this.similarity(a, b) >= AI_THRESHOLDS.JW_ENTITY_MATCH;
  }
}


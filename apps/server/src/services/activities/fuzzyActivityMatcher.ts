import { logger } from '../../logger';
import { FuzzyMatcher } from '../entities/fuzzyMatcher';
import { LocationVectorizer } from '../locations/locationVectorizer';

import type { ExtractedActivity, ResolvedActivity } from './types';

/**
 * Fuzzy matching for activities using embeddings and text similarity
 */
export class FuzzyActivityMatcher {
  private vectorizer: LocationVectorizer; // Reuse vectorizer (same cosine similarity logic)
  private textMatcher: FuzzyMatcher;

  constructor() {
    this.vectorizer = new LocationVectorizer();
    this.textMatcher = new FuzzyMatcher();
  }

  /**
   * Check if extracted activity is duplicate of existing activity
   */
  isDuplicate(extracted: ExtractedActivity, existing: ResolvedActivity): boolean {
    try {
      if (!extracted.normalizedName) {
        return false;
      }

      // Text similarity (Jaro-Winkler)
      const textSim = this.textMatcher.similarity(
        extracted.normalizedName,
        existing.normalized_name
      );

      // Vector similarity (if embeddings exist)
      let vectorSim = 0;
      if (extracted.embedding.length > 0 && existing.embedding && existing.embedding.length > 0) {
        vectorSim = this.vectorizer.similarity(extracted.embedding, existing.embedding);
      }

      // Category match bonus
      const typeMatch = extracted.category === existing.category ? 0.1 : 0;

      // Combined score
      const score = vectorSim * 0.65 + textSim * 0.25 + typeMatch;

      logger.debug(
        {
          extracted: extracted.normalizedName,
          existing: existing.normalized_name,
          vectorSim,
          textSim,
          typeMatch,
          score,
        },
        'Activity matching score'
      );

      return score >= 0.80;
    } catch (error) {
      logger.error({ error }, 'Failed to check activity duplicate');
      return false;
    }
  }
}


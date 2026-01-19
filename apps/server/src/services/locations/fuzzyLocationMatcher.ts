import { logger } from '../../logger';
import { FuzzyMatcher } from '../entities/fuzzyMatcher';

import { LocationVectorizer } from './locationVectorizer';
import type { ExtractedLocation, ResolvedLocation } from './types';

/**
 * Fuzzy matching for locations using embeddings and text similarity
 */
export class FuzzyLocationMatcher {
  private vectorizer: LocationVectorizer;
  private textMatcher: FuzzyMatcher;

  constructor() {
    this.vectorizer = new LocationVectorizer();
    this.textMatcher = new FuzzyMatcher();
  }

  /**
   * Check if extracted location is duplicate of existing location
   */
  isDuplicate(extracted: ExtractedLocation, existing: ResolvedLocation): boolean {
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

      // Type match bonus
      const typeMatch = extracted.type === existing.type ? 0.1 : 0;

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
        'Location matching score'
      );

      return score >= 0.80;
    } catch (error) {
      logger.error({ error }, 'Failed to check location duplicate');
      return false;
    }
  }
}


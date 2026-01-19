import { logger } from '../../logger';
import { FuzzyMatcher } from '../entities/fuzzyMatcher';

import { EventVectorizer } from './eventVectorizer';
import type { ExtractedEvent, ResolvedEvent } from './types';

/**
 * Fuzzy matching for events using multiple signals
 */
export class FuzzyEventMatcher {
  private vectorizer: EventVectorizer;
  private textMatcher: FuzzyMatcher;

  constructor() {
    this.vectorizer = new EventVectorizer();
    this.textMatcher = new FuzzyMatcher();
  }

  /**
   * Check if extracted event is duplicate of existing event
   */
  isDuplicate(extracted: ExtractedEvent, existing: ResolvedEvent): boolean {
    try {
      // Text similarity (first 120 chars)
      const textSim = this.textMatcher.similarity(
        extracted.raw.slice(0, 120).toLowerCase(),
        (existing.summary || existing.canonical_title || '').slice(0, 120).toLowerCase()
      );

      // Vector similarity (if embeddings exist)
      let vectorSim = 0;
      if (extracted.embedding.length > 0 && existing.embedding && existing.embedding.length > 0) {
        vectorSim = this.vectorizer.similarity(extracted.embedding, existing.embedding);
      }

      // Time proximity (within 3 hours)
      let timeClose = false;
      if (extracted.timestamp && existing.start_time) {
        const extractedTime = new Date(extracted.timestamp).getTime();
        const existingTime = new Date(existing.start_time).getTime();
        const diffHours = Math.abs(extractedTime - existingTime) / (1000 * 60 * 60);
        timeClose = diffHours < 3;
      }

      // Location match
      let locationMatch = false;
      if (extracted.location && existing.summary) {
        const locationLower = extracted.location.toLowerCase();
        const summaryLower = existing.summary.toLowerCase();
        locationMatch = summaryLower.includes(locationLower);
      }

      // Combined score
      const score =
        vectorSim * 0.55 +
        textSim * 0.25 +
        (timeClose ? 0.15 : 0) +
        (locationMatch ? 0.05 : 0);

      logger.debug(
        {
          vectorSim,
          textSim,
          timeClose,
          locationMatch,
          score,
        },
        'Event matching score'
      );

      return score >= 0.82;
    } catch (error) {
      logger.error({ error }, 'Failed to check event duplicate');
      return false;
    }
  }
}


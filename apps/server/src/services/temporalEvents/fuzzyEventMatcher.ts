import { logger } from '../../logger';
import { FuzzyMatcher } from '../entities/fuzzyMatcher';
import { LocationVectorizer } from '../locations/locationVectorizer';

import type { ResolvedEvent } from './types';

/**
 * Fuzzy matching for temporal events using multiple signals
 */
export class FuzzyEventMatcher {
  private vectorizer: LocationVectorizer;
  private textMatcher: FuzzyMatcher;

  constructor() {
    this.vectorizer = new LocationVectorizer();
    this.textMatcher = new FuzzyMatcher();
  }

  /**
   * Check if candidate event is duplicate of existing event
   */
  isDuplicate(candidate: ResolvedEvent, existing: ResolvedEvent): boolean {
    try {
      // Time overlap
      const candidateStart = new Date(candidate.startTime).getTime();
      const candidateEnd = new Date(candidate.endTime || candidate.startTime).getTime();
      const existingStart = new Date(existing.startTime).getTime();
      const existingEnd = new Date(existing.endTime || existing.startTime).getTime();

      const timeOverlap =
        candidateStart <= existingEnd && candidateEnd >= existingStart;

      // People overlap
      const peopleOverlap = candidate.people.some(p => existing.people.includes(p));

      // Activity overlap
      const activityOverlap = candidate.activities.some(a => existing.activities.includes(a));

      // Text similarity
      const candidateSummary = (candidate.summary || '').slice(0, 120);
      const existingSummary = (existing.summary || '').slice(0, 120);
      const textSim = this.textMatcher.similarity(candidateSummary, existingSummary);

      // Vector similarity (if embeddings exist)
      let vectorSim = 0;
      if (candidate.embedding && candidate.embedding.length > 0 && 
          existing.embedding && existing.embedding.length > 0) {
        vectorSim = this.vectorizer.similarity(candidate.embedding, existing.embedding);
      }

      // Combined score
      const score =
        (timeOverlap ? 0.25 : 0) +
        (peopleOverlap ? 0.25 : 0) +
        (activityOverlap ? 0.25 : 0) +
        vectorSim * 0.15 +
        textSim * 0.10;

      logger.debug(
        {
          timeOverlap,
          peopleOverlap,
          activityOverlap,
          textSim,
          vectorSim,
          score,
        },
        'Temporal event matching score'
      );

      return score >= 0.80;
    } catch (error) {
      logger.error({ error }, 'Failed to check event duplicate');
      return false;
    }
  }
}


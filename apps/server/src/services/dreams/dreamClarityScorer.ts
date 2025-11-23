import { logger } from '../../logger';
import type { DreamSignal } from './types';

/**
 * Measures how clearly the user expresses a dream
 */
export class DreamClarityScorer {
  /**
   * Score overall clarity of dreams
   */
  score(dreams: DreamSignal[]): number {
    if (dreams.length === 0) return 0;

    try {
      const totalClarity = dreams.reduce((sum, dream) => sum + dream.clarity, 0);
      return totalClarity / dreams.length;
    } catch (error) {
      logger.error({ error }, 'Failed to score dream clarity');
      return 0;
    }
  }

  /**
   * Score clarity by category
   */
  scoreByCategory(dreams: DreamSignal[]): Record<string, number> {
    const scores: Record<string, number> = {};

    try {
      const byCategory: Record<string, DreamSignal[]> = {};
      for (const dream of dreams) {
        if (!byCategory[dream.category]) {
          byCategory[dream.category] = [];
        }
        byCategory[dream.category].push(dream);
      }

      for (const [category, categoryDreams] of Object.entries(byCategory)) {
        scores[category] = this.score(categoryDreams);
      }

      return scores;
    } catch (error) {
      logger.error({ error }, 'Failed to score clarity by category');
      return {};
    }
  }

  /**
   * Get clarity category
   */
  getClarityCategory(score: number): 'very_clear' | 'clear' | 'moderate' | 'unclear' | 'very_unclear' {
    if (score >= 0.8) return 'very_clear';
    if (score >= 0.6) return 'clear';
    if (score >= 0.4) return 'moderate';
    if (score >= 0.2) return 'unclear';
    return 'very_unclear';
  }
}


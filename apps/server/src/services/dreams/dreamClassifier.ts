import { logger } from '../../logger';
import type { DreamSignal, DreamCategory } from './types';

/**
 * Clusters dreams and determines core dream categories
 */
export class DreamClassifier {
  /**
   * Group dreams by category
   */
  groupByCategory(dreams: DreamSignal[]): Record<string, DreamSignal[]> {
    const map: Record<string, DreamSignal[]> = {};

    try {
      for (const dream of dreams) {
        const category = dream.category;

        if (!map[category]) {
          map[category] = [];
        }

        map[category].push(dream);
      }

      // Sort each category's dreams by desire (highest first)
      for (const category in map) {
        map[category].sort((a, b) => b.desire - a.desire);
      }

      logger.debug({ categories: Object.keys(map).length }, 'Grouped dreams by category');

      return map;
    } catch (error) {
      logger.error({ error }, 'Failed to group dreams');
      return {};
    }
  }

  /**
   * Detect core dreams based on desire and clarity
   */
  detectCoreDreams(groups: Record<string, DreamSignal[]>, topN: number = 4): string[] {
    try {
      const ranked = Object.entries(groups).map(([cat, list]) => ({
        category: cat,
        score: list.reduce((sum, dream) => sum + dream.desire + dream.clarity, 0),
        count: list.length,
        avgDesire: list.reduce((sum, dream) => sum + dream.desire, 0) / list.length,
        avgClarity: list.reduce((sum, dream) => sum + dream.clarity, 0) / list.length,
      }));

      // Sort by score (desire + clarity)
      ranked.sort((a, b) => {
        // Primary sort: total score
        if (b.score !== a.score) return b.score - a.score;
        // Secondary sort: average desire
        if (b.avgDesire !== a.avgDesire) return b.avgDesire - a.avgDesire;
        // Tertiary sort: count
        return b.count - a.count;
      });

      const coreDreams = ranked.slice(0, topN).map(s => s.category);

      logger.debug({ coreDreams, topN }, 'Detected core dreams');

      return coreDreams;
    } catch (error) {
      logger.error({ error }, 'Failed to detect core dreams');
      return [];
    }
  }

  /**
   * Get dream statistics
   */
  getDreamStats(groups: Record<string, DreamSignal[]>): Array<{
    category: DreamCategory;
    count: number;
    totalScore: number;
    averageDesire: number;
    averageClarity: number;
  }> {
    try {
      return Object.entries(groups).map(([cat, dreams]) => ({
        category: cat as DreamCategory,
        count: dreams.length,
        totalScore: dreams.reduce((sum, d) => sum + d.desire + d.clarity, 0),
        averageDesire: dreams.reduce((sum, d) => sum + d.desire, 0) / dreams.length,
        averageClarity: dreams.reduce((sum, d) => sum + d.clarity, 0) / dreams.length,
      })).sort((a, b) => b.totalScore - a.totalScore);
    } catch (error) {
      logger.error({ error }, 'Failed to get dream stats');
      return [];
    }
  }
}


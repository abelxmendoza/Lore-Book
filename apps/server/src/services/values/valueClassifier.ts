import { logger } from '../../logger';

import type { ValueSignal, ValueCategory } from './types';

/**
 * Groups repeated value themes and detects core values
 */
export class ValueClassifier {
  /**
   * Group value signals by category
   */
  groupByCategory(signals: ValueSignal[]): Record<string, ValueSignal[]> {
    const map: Record<string, ValueSignal[]> = {};

    try {
      for (const signal of signals) {
        const category = signal.category;

        if (!map[category]) {
          map[category] = [];
        }

        map[category].push(signal);
      }

      // Sort each category's signals by strength (highest first)
      for (const category in map) {
        map[category].sort((a, b) => b.strength - a.strength);
      }

      logger.debug({ categories: Object.keys(map).length }, 'Grouped value signals by category');

      return map;
    } catch (error) {
      logger.error({ error }, 'Failed to group value signals');
      return {};
    }
  }

  /**
   * Detect core values based on frequency and strength
   */
  detectCoreValues(groups: Record<string, ValueSignal[]>, topN: number = 5): string[] {
    try {
      const scores = Object.entries(groups).map(([cat, list]) => ({
        category: cat,
        score: list.reduce((sum, signal) => sum + signal.strength, 0),
        count: list.length,
        averageStrength: list.reduce((sum, signal) => sum + signal.strength, 0) / list.length,
      }));

      // Sort by score (total strength) descending
      scores.sort((a, b) => {
        // Primary sort: total score
        if (b.score !== a.score) return b.score - a.score;
        // Secondary sort: count
        if (b.count !== a.count) return b.count - a.count;
        // Tertiary sort: average strength
        return b.averageStrength - a.averageStrength;
      });

      const coreValues = scores.slice(0, topN).map(s => s.category);

      logger.debug({ coreValues, topN }, 'Detected core values');

      return coreValues;
    } catch (error) {
      logger.error({ error }, 'Failed to detect core values');
      return [];
    }
  }

  /**
   * Get value statistics
   */
  getValueStats(groups: Record<string, ValueSignal[]>): Array<{
    category: ValueCategory;
    count: number;
    totalStrength: number;
    averageStrength: number;
  }> {
    try {
      return Object.entries(groups).map(([cat, signals]) => ({
        category: cat as ValueCategory,
        count: signals.length,
        totalStrength: signals.reduce((sum, s) => sum + s.strength, 0),
        averageStrength: signals.reduce((sum, s) => sum + s.strength, 0) / signals.length,
      })).sort((a, b) => b.totalStrength - a.totalStrength);
    } catch (error) {
      logger.error({ error }, 'Failed to get value stats');
      return [];
    }
  }
}


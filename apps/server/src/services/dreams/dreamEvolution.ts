import { logger } from '../../logger';

import type { DreamSignal } from './types';

/**
 * Detects dream drift (changing ambitions)
 */
export class DreamEvolution {
  /**
   * Compute evolution by year
   */
  computeEvolution(signals: DreamSignal[]): Record<string, string[]> {
    const byYear: Record<string, string[]> = {};

    try {
      for (const signal of signals) {
        const year = new Date(signal.timestamp).getFullYear().toString();

        if (!byYear[year]) {
          byYear[year] = [];
        }

        byYear[year].push(signal.category);
      }

      logger.debug({ years: Object.keys(byYear).length }, 'Computed dream evolution');

      return byYear;
    } catch (error) {
      logger.error({ error }, 'Failed to compute dream evolution');
      return {};
    }
  }

  /**
   * Detect dream shifts (categories that appear/disappear over time)
   */
  detectShifts(evolution: Record<string, string[]>): Array<{
    category: string;
    shift: 'emerging' | 'disappearing' | 'stable';
    first_year: string | null;
    last_year: string | null;
  }> {
    try {
      const years = Object.keys(evolution).sort();
      if (years.length < 2) return [];

      const shifts: Array<{
        category: string;
        shift: 'emerging' | 'disappearing' | 'stable';
        first_year: string | null;
        last_year: string | null;
      }> = [];

      // Get all categories
      const allCategories = new Set<string>();
      for (const yearCategories of Object.values(evolution)) {
        yearCategories.forEach(cat => allCategories.add(cat));
      }

      // Analyze each category
      for (const category of allCategories) {
        const firstYear = years.find(y => evolution[y].includes(category));
        const lastYear = years.slice().reverse().find(y => evolution[y].includes(category));

        if (!firstYear || !lastYear) continue;

        const firstIndex = years.indexOf(firstYear);
        const lastIndex = years.indexOf(lastYear);

        // Category appears in recent years but not early years = emerging
        if (firstIndex > years.length / 2) {
          shifts.push({
            category,
            shift: 'emerging',
            first_year: firstYear,
            last_year: lastYear,
          });
        }
        // Category appears in early years but not recent years = disappearing
        else if (lastIndex < years.length / 2) {
          shifts.push({
            category,
            shift: 'disappearing',
            first_year: firstYear,
            last_year: lastYear,
          });
        }
      }

      return shifts;
    } catch (error) {
      logger.error({ error }, 'Failed to detect dream shifts');
      return [];
    }
  }

  /**
   * Get evolution summary
   */
  getSummary(evolution: Record<string, string[]>): {
    years_tracked: number;
    total_categories: number;
    most_active_year: string | null;
    most_active_category: string | null;
  } {
    try {
      const years = Object.keys(evolution);
      const allCategories = new Set<string>();

      for (const yearCategories of Object.values(evolution)) {
        yearCategories.forEach(cat => allCategories.add(cat));
      }

      // Find most active year
      let mostActiveYear: string | null = null;
      let maxCount = 0;

      for (const [year, categories] of Object.entries(evolution)) {
        if (categories.length > maxCount) {
          maxCount = categories.length;
          mostActiveYear = year;
        }
      }

      // Find most active category
      const categoryCounts: Record<string, number> = {};
      for (const categories of Object.values(evolution)) {
        for (const cat of categories) {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      }

      let mostActiveCategory: string | null = null;
      let maxCategoryCount = 0;

      for (const [cat, count] of Object.entries(categoryCounts)) {
        if (count > maxCategoryCount) {
          maxCategoryCount = count;
          mostActiveCategory = cat;
        }
      }

      return {
        years_tracked: years.length,
        total_categories: allCategories.size,
        most_active_year: mostActiveYear,
        most_active_category: mostActiveCategory,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get evolution summary');
      return {
        years_tracked: 0,
        total_categories: 0,
        most_active_year: null,
        most_active_category: null,
      };
    }
  }
}


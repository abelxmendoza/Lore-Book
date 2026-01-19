import { logger } from '../../logger';

import type { FinancialTransaction, SpendingPattern } from './types';

/**
 * Classifies spending behavior, volatility, and frequency
 */
export class SpendingClassifier {
  /**
   * Classify spending patterns
   */
  classify(transactions: FinancialTransaction[]): SpendingPattern[] {
    const patterns: SpendingPattern[] = [];

    try {
      // Filter spending transactions
      const spending = transactions.filter((t) => t.direction === 'out' && t.category !== 'investment');

      // Group by category
      const grouped: Record<string, number[]> = {};

      spending.forEach((t) => {
        if (!grouped[t.category]) {
          grouped[t.category] = [];
        }
        grouped[t.category].push(t.amount);
      });

      // Calculate patterns for each category
      for (const [category, amounts] of Object.entries(grouped)) {
        const total = amounts.reduce((a, b) => a + b, 0);
        const average = total / amounts.length;
        const volatility = this.computeVolatility(amounts);
        const trend = this.computeTrend(amounts);

        patterns.push({
          category,
          average,
          frequency: amounts.length,
          volatility,
          total,
          trend,
        });
      }

      // Sort by total spending (descending)
      patterns.sort((a, b) => b.total - a.total);

      logger.debug({ patterns: patterns.length, spending: spending.length }, 'Classified spending patterns');

      return patterns;
    } catch (error) {
      logger.error({ error }, 'Failed to classify spending');
      return [];
    }
  }

  /**
   * Compute volatility (standard deviation)
   */
  private computeVolatility(arr: number[]): number {
    if (arr.length < 2) return 0;

    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * Compute trend (increasing, decreasing, stable)
   */
  private computeTrend(amounts: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (amounts.length < 3) return 'stable';

    // Split into first half and second half
    const mid = Math.floor(amounts.length / 2);
    const firstHalf = amounts.slice(0, mid);
    const secondHalf = amounts.slice(mid);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    const threshold = firstAvg * 0.1; // 10% change threshold

    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'decreasing';
    return 'stable';
  }
}


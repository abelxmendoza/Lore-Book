import { logger } from '../../logger';
import type { FinancialTransaction, IncomeTrend } from './types';

/**
 * Detects income trends and stability
 */
export class IncomeDetector {
  /**
   * Detect income trends
   */
  detect(transactions: FinancialTransaction[]): IncomeTrend {
    try {
      // Filter income transactions
      const income = transactions.filter((t) => t.direction === 'in' || t.category === 'income');

      if (income.length === 0) {
        return {
          averageIncome: 0,
          stability: 0,
          growthRate: 0,
          frequency: 0,
        };
      }

      // Calculate average income
      const amounts = income.map((t) => t.amount);
      const averageIncome = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      // Calculate stability (inverse of coefficient of variation)
      const variance = this.variance(amounts);
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = averageIncome > 0 ? stdDev / averageIncome : 1;
      const stability = Math.max(0, Math.min(1, 1 - coefficientOfVariation));

      // Calculate growth rate (simplified - compare first half vs second half)
      const growthRate = this.calculateGrowthRate(income);

      // Get most recent income
      const sorted = [...income].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA; // Most recent first
      });
      const lastIncome = sorted[0]?.timestamp;

      logger.debug(
        {
          incomeCount: income.length,
          averageIncome,
          stability,
          growthRate,
        },
        'Detected income trends'
      );

      return {
        averageIncome,
        stability,
        growthRate,
        frequency: income.length,
        lastIncome,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect income trends');
      return {
        averageIncome: 0,
        stability: 0,
        growthRate: 0,
        frequency: 0,
      };
    }
  }

  /**
   * Calculate variance
   */
  private variance(arr: number[]): number {
    if (arr.length < 2) return 0;

    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / arr.length;
  }

  /**
   * Calculate growth rate
   */
  private calculateGrowthRate(income: FinancialTransaction[]): number {
    if (income.length < 2) return 0;

    // Sort by timestamp
    const sorted = [...income].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Split into first half and second half
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const firstAvg = firstHalf.reduce((sum, t) => sum + t.amount, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t.amount, 0) / secondHalf.length;

    if (firstAvg === 0) return secondAvg > 0 ? 1 : 0;

    const growthRate = (secondAvg - firstAvg) / firstAvg;
    return Math.max(-1, Math.min(1, growthRate)); // Clamp to -1 to 1
  }
}


import { logger } from '../../logger';
import type { FinancialTransaction, ForecastResult, IncomeTrend, SpendingPattern } from './types';

/**
 * Forecasts future financial projections
 */
export class FinancialForecaster {
  /**
   * Forecast financial projections
   */
  forecast(
    transactions: FinancialTransaction[],
    incomeTrend: IncomeTrend,
    spendingPatterns: SpendingPattern[]
  ): ForecastResult {
    try {
      const months = 12;

      // Calculate base values
      const incomeBase = incomeTrend.averageIncome || 0;
      const totalSpending = spendingPatterns.reduce((sum, p) => sum + p.average * p.frequency, 0);
      const spendingBase = spendingPatterns.length > 0 ? totalSpending / spendingPatterns.length : 0;

      // Calculate savings rate
      const savingsRate = incomeBase > 0 ? Math.max(0, (incomeBase - spendingBase) / incomeBase) : 0;

      // Projections with growth/decline trends
      const incomeProjection: number[] = [];
      const spendingProjection: number[] = [];
      const savingsProjection: number[] = [];
      const investmentProjection: number[] = [];

      for (let i = 0; i < months; i++) {
        // Income projection (with growth rate)
        const incomeGrowth = incomeTrend.growthRate || 0;
        const projectedIncome = incomeBase * (1 + incomeGrowth * (i / 12));
        incomeProjection.push(Math.max(0, projectedIncome));

        // Spending projection (assume stable with slight inflation)
        const inflation = 0.02; // 2% annual inflation
        const projectedSpending = spendingBase * (1 + inflation * (i / 12));
        spendingProjection.push(Math.max(0, projectedSpending));

        // Savings projection (income - spending)
        const projectedSavings = projectedIncome - projectedSpending;
        savingsProjection.push(Math.max(0, projectedSavings));

        // Investment projection (assume consistent percentage of savings)
        const investmentRate = 0.3; // 30% of savings invested
        const projectedInvestment = projectedSavings * investmentRate;
        investmentProjection.push(Math.max(0, projectedInvestment));
      }

      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(transactions, incomeTrend, spendingPatterns);

      logger.debug(
        {
          months,
          incomeBase,
          spendingBase,
          savingsRate,
          confidence,
        },
        'Generated financial forecast'
      );

      return {
        savingsProjection,
        spendingProjection,
        investmentProjection,
        incomeProjection,
        confidence,
        months,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to forecast finances');
      return {
        savingsProjection: Array(12).fill(0),
        spendingProjection: Array(12).fill(0),
        investmentProjection: Array(12).fill(0),
        incomeProjection: Array(12).fill(0),
        confidence: 0,
        months: 12,
      };
    }
  }

  /**
   * Calculate forecast confidence
   */
  private calculateConfidence(
    transactions: FinancialTransaction[],
    incomeTrend: IncomeTrend,
    spendingPatterns: SpendingPattern[]
  ): number {
    let confidence = 0.5; // Base confidence

    // More transactions = higher confidence
    if (transactions.length > 20) {
      confidence += 0.2;
    } else if (transactions.length > 10) {
      confidence += 0.1;
    }

    // Stable income = higher confidence
    if (incomeTrend.stability > 0.7) {
      confidence += 0.15;
    } else if (incomeTrend.stability > 0.5) {
      confidence += 0.1;
    }

    // More spending patterns = higher confidence
    if (spendingPatterns.length > 5) {
      confidence += 0.15;
    } else if (spendingPatterns.length > 3) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }
}


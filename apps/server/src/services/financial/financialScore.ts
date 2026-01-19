import { logger } from '../../logger';

import type { SpendingPattern, IncomeTrend, InvestmentProfile, ForecastResult, FinancialScore } from './types';

/**
 * Computes overall financial health scores
 */
export class FinancialScoreService {
  /**
   * Compute financial score
   */
  compute(
    spending: SpendingPattern[],
    income: IncomeTrend,
    investments: InvestmentProfile,
    forecast: ForecastResult
  ): FinancialScore {
    try {
      // Spending score: inverse of spending relative to income
      const totalSpending = spending.reduce((sum, p) => sum + p.average * p.frequency, 0);
      const spendingRatio = income.averageIncome > 0 ? totalSpending / income.averageIncome : 1;
      const spendingScore = Math.max(0, Math.min(1, 1 - spendingRatio * 0.5)); // Penalize high spending

      // Income score: based on stability and growth
      const incomeScore = (income.stability * 0.6 + Math.max(0, income.growthRate + 0.5) * 0.4);

      // Investment score: based on consistency and DCA strength
      const investmentScore = (investments.consistency * 0.4 + investments.DCA_strength * 0.4 + investments.diversification * 0.2);

      // Savings score: based on forecasted savings
      const avgSavings = forecast.savingsProjection.length > 0
        ? forecast.savingsProjection.reduce((sum, s) => sum + s, 0) / forecast.savingsProjection.length
        : 0;
      const savingsScore = Math.min(1, avgSavings / 1000); // Normalize to $1000/month

      // Overall weighted score
      const overall = (
        spendingScore * 0.25 +
        incomeScore * 0.25 +
        investmentScore * 0.25 +
        savingsScore * 0.25
      );

      logger.debug(
        {
          spendingScore,
          incomeScore,
          investmentScore,
          savingsScore,
          overall,
        },
        'Computed financial score'
      );

      return {
        spending: spendingScore,
        income: incomeScore,
        investments: investmentScore,
        savings: savingsScore,
        overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute financial score');
      return {
        spending: 0.5,
        income: 0.5,
        investments: 0.5,
        savings: 0.5,
        overall: 0.5,
      };
    }
  }

  /**
   * Get financial health category
   */
  getCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    if (score >= 0.2) return 'poor';
    return 'critical';
  }
}


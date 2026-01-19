import { logger } from '../../logger';

import type { FinancialTransaction, IncomeTrend, FinancialStressScore } from './types';

/**
 * Computes financial stress scores
 */
export class FinancialStressModel {
  /**
   * Compute financial stress score
   */
  compute(transactions: FinancialTransaction[], incomeTrend: IncomeTrend): FinancialStressScore {
    try {
      const expenses = transactions.filter((t) => t.direction === 'out' && t.category !== 'investment');
      const totalOut = expenses.reduce((a, b) => a + b.amount, 0);

      const drivers: string[] = [];
      let stressScore = 0.3; // Base stress level

      // Income vs expenses ratio
      if (incomeTrend.averageIncome > 0) {
        const expenseRatio = totalOut / incomeTrend.averageIncome;
        
        if (expenseRatio > 0.9) {
          stressScore = 0.8;
          drivers.push('high spending relative to income');
        } else if (expenseRatio > 0.7) {
          stressScore = 0.6;
          drivers.push('spending approaching income limit');
        } else if (expenseRatio < 0.5) {
          stressScore = 0.2;
          drivers.push('healthy spending ratio');
        }
      } else {
        stressScore = 0.7;
        drivers.push('no income detected');
      }

      // Income stability
      if (incomeTrend.stability < 0.5) {
        stressScore += 0.15;
        drivers.push('unstable income');
      }

      // Debt presence
      const debtTransactions = transactions.filter((t) => t.category === 'debt');
      if (debtTransactions.length > 0) {
        const totalDebt = debtTransactions.reduce((sum, t) => sum + t.amount, 0);
        if (totalDebt > incomeTrend.averageIncome * 0.3) {
          stressScore += 0.2;
          drivers.push('high debt burden');
        } else {
          drivers.push('debt present');
        }
      }

      // Spending volatility
      const spendingAmounts = expenses.map((e) => e.amount);
      if (spendingAmounts.length > 1) {
        const avgSpending = spendingAmounts.reduce((a, b) => a + b, 0) / spendingAmounts.length;
        const variance = spendingAmounts.reduce((sum, a) => sum + Math.pow(a - avgSpending, 2), 0) / spendingAmounts.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = avgSpending > 0 ? stdDev / avgSpending : 0;

        if (coefficientOfVariation > 0.5) {
          stressScore += 0.1;
          drivers.push('volatile spending');
        }
      }

      // Clamp stress score to 0-1
      stressScore = Math.max(0, Math.min(1, stressScore));

      // If no drivers, add default
      if (drivers.length === 0) {
        drivers.push('stable financial situation');
      }

      const confidence = Math.min(1, (transactions.length / 10) * 0.5 + 0.5); // More data = higher confidence

      logger.debug(
        {
          stressScore,
          drivers,
          totalExpenses: totalOut,
          averageIncome: incomeTrend.averageIncome,
        },
        'Computed financial stress'
      );

      return {
        score: stressScore,
        drivers,
        confidence,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute financial stress');
      return {
        score: 0.5,
        drivers: ['unable to compute'],
        confidence: 0,
      };
    }
  }
}


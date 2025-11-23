import { logger } from '../../logger';
import type { FinancialTransaction, InvestmentProfile } from './types';

/**
 * Analyzes investment behavior and profile
 */
export class InvestmentBehavior {
  /**
   * Profile investment behavior
   */
  profile(transactions: FinancialTransaction[]): InvestmentProfile {
    try {
      // Filter investment transactions
      const investments = transactions.filter((t) => t.category === 'investment');

      if (investments.length === 0) {
        return {
          riskLevel: 0.5,
          consistency: 0.3,
          diversification: 0.3,
          DCA_strength: 0.3,
          totalInvested: 0,
          frequency: 0,
        };
      }

      // Calculate total invested
      const totalInvested = investments.reduce((sum, t) => sum + t.amount, 0);

      // Consistency: how regularly investments are made
      const consistency = this.calculateConsistency(investments);

      // Diversification: variety of investment types (simplified - based on evidence keywords)
      const diversification = this.calculateDiversification(investments);

      // DCA (Dollar Cost Averaging) strength: regularity of similar amounts
      const DCA_strength = this.calculateDCAStrength(investments);

      // Risk level: based on investment types mentioned (simplified)
      const riskLevel = this.calculateRiskLevel(investments);

      logger.debug(
        {
          investmentCount: investments.length,
          totalInvested,
          consistency,
          diversification,
          DCA_strength,
          riskLevel,
        },
        'Profiled investment behavior'
      );

      return {
        riskLevel,
        consistency,
        diversification,
        DCA_strength,
        totalInvested,
        frequency: investments.length,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to profile investment behavior');
      return {
        riskLevel: 0.5,
        consistency: 0.3,
        diversification: 0.3,
        DCA_strength: 0.3,
        totalInvested: 0,
        frequency: 0,
      };
    }
  }

  /**
   * Calculate investment consistency
   */
  private calculateConsistency(investments: FinancialTransaction[]): number {
    if (investments.length < 2) return 0.3;

    // Sort by timestamp
    const sorted = [...investments].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Calculate time intervals between investments
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    // Consistency = inverse of coefficient of variation of intervals
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 1;

    return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
  }

  /**
   * Calculate diversification (simplified)
   */
  private calculateDiversification(investments: FinancialTransaction[]): number {
    // Check for different investment types in evidence
    const types = new Set<string>();

    investments.forEach((inv) => {
      const evidence = inv.evidence.toLowerCase();
      if (evidence.includes('stock') || evidence.includes('spy') || evidence.includes('etf')) {
        types.add('stocks');
      }
      if (evidence.includes('crypto') || evidence.includes('btc') || evidence.includes('bitcoin') || evidence.includes('ethereum')) {
        types.add('crypto');
      }
      if (evidence.includes('401k') || evidence.includes('ira') || evidence.includes('retirement')) {
        types.add('retirement');
      }
      if (evidence.includes('bond') || evidence.includes('treasury')) {
        types.add('bonds');
      }
    });

    // More types = higher diversification
    return Math.min(1, types.size / 4); // Normalize to 0-1
  }

  /**
   * Calculate DCA (Dollar Cost Averaging) strength
   */
  private calculateDCAStrength(investments: FinancialTransaction[]): number {
    if (investments.length < 3) return 0.3;

    const amounts = investments.map((inv) => inv.amount);
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Calculate how similar amounts are (lower variance = stronger DCA)
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgAmount > 0 ? stdDev / avgAmount : 1;

    // Also check regularity of timing (from consistency)
    const consistency = this.calculateConsistency(investments);

    // Combine amount similarity and timing consistency
    const amountSimilarity = Math.max(0, 1 - coefficientOfVariation);
    return (amountSimilarity * 0.6 + consistency * 0.4);
  }

  /**
   * Calculate risk level (simplified)
   */
  private calculateRiskLevel(investments: FinancialTransaction[]): number {
    let riskScore = 0.5; // Default moderate risk

    investments.forEach((inv) => {
      const evidence = inv.evidence.toLowerCase();

      // High risk indicators
      if (evidence.includes('crypto') || evidence.includes('bitcoin') || evidence.includes('btc')) {
        riskScore += 0.2;
      }
      if (evidence.includes('options') || evidence.includes('futures') || evidence.includes('derivatives')) {
        riskScore += 0.3;
      }

      // Low risk indicators
      if (evidence.includes('bond') || evidence.includes('treasury') || evidence.includes('cd')) {
        riskScore -= 0.2;
      }
      if (evidence.includes('401k') || evidence.includes('ira') || evidence.includes('retirement')) {
        riskScore -= 0.1;
      }
    });

    return Math.max(0, Math.min(1, riskScore / investments.length));
  }
}


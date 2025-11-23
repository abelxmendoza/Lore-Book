import { logger } from '../../logger';
import type { RegulationScore, EQGrowthMetrics, EmotionSignal, RecoveryPoint } from './types';

/**
 * Tracks emotional maturity over time
 */
export class EQGrowthTracker {
  /**
   * Track EQ growth from regulation scores
   */
  track(
    regulation: RegulationScore,
    signals?: EmotionSignal[],
    recovery?: RecoveryPoint[]
  ): EQGrowthMetrics {
    try {
      // Calculate growth potential
      const growthPotential = (
        regulation.stability +
        regulation.resilience +
        regulation.emotionalFlexibility
      ) / 3;

      // Identify risk zones
      const riskZones = {
        instability: regulation.stability < 0.4,
        impulsivity: regulation.modulation < 0.4,
        emotionalRigidity: regulation.emotionalFlexibility < 0.3,
        slowRecovery: false, // Will be calculated if recovery data available
      };

      // Calculate slow recovery risk if recovery data available
      if (recovery && recovery.length > 0) {
        // Check if average recovery time is high
        const avgIntensity = recovery.reduce((sum, p) => sum + p.avg, 0) / recovery.length;
        const highIntensityDays = recovery.filter(p => p.avg > 0.7).length;
        const recoveryRatio = highIntensityDays / recovery.length;

        // Slow recovery if high intensity persists
        riskZones.slowRecovery = recoveryRatio > 0.3 && avgIntensity > 0.6;
      }

      // Calculate trends (simplified - would need historical data for real trends)
      const trends = {
        stability_trend: this.determineTrend(regulation.stability, 0.5) as 'improving' | 'declining' | 'stable',
        resilience_trend: this.determineTrend(regulation.resilience, 0.5) as 'improving' | 'declining' | 'stable',
        flexibility_trend: this.determineTrend(regulation.emotionalFlexibility, 0.5) as 'improving' | 'declining' | 'stable',
      };

      return {
        growthPotential,
        riskZones,
        trends,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to track EQ growth');
      return {
        growthPotential: 0.5,
        riskZones: {
          instability: false,
          impulsivity: false,
          emotionalRigidity: false,
          slowRecovery: false,
        },
        trends: {
          stability_trend: 'stable',
          resilience_trend: 'stable',
          flexibility_trend: 'stable',
        },
      };
    }
  }

  /**
   * Determine trend from current value (simplified - would need historical comparison)
   */
  private determineTrend(current: number, baseline: number): 'improving' | 'declining' | 'stable' {
    const diff = current - baseline;
    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate EQ growth rate over time
   */
  calculateGrowthRate(
    historicalScores: Array<{ timestamp: string; score: number }>
  ): number {
    if (historicalScores.length < 2) return 0;

    try {
      // Sort by timestamp
      const sorted = [...historicalScores].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      // Calculate linear regression slope
      const n = sorted.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = sorted.map(s => s.score);

      const sumX = x.reduce((sum, val) => sum + val, 0);
      const sumY = y.reduce((sum, val) => sum + val, 0);
      const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
      const sumX2 = x.reduce((sum, val) => sum + val * val, 0);

      const denominator = n * sumX2 - sumX * sumX;
      if (denominator === 0) return 0;

      const slope = (n * sumXY - sumX * sumY) / denominator;

      return slope;
    } catch (error) {
      logger.error({ error }, 'Failed to calculate growth rate');
      return 0;
    }
  }
}


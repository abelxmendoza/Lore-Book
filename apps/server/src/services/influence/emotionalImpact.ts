import { logger } from '../../logger';
import type { InfluenceEvent } from './types';

/**
 * Computes emotional impact of interactions
 */
export class EmotionalImpact {
  /**
   * Compute average emotional impact from events
   */
  compute(events: InfluenceEvent[]): number {
    if (events.length === 0) return 0;

    try {
      const sum = events.reduce((acc, e) => acc + (e.sentiment || 0), 0);
      const average = sum / events.length;

      // Clamp between -1 and +1
      return Math.max(-1, Math.min(1, average));
    } catch (error) {
      logger.error({ error }, 'Failed to compute emotional impact');
      return 0;
    }
  }

  /**
   * Compute emotional impact trend (improving or declining)
   */
  computeTrend(events: InfluenceEvent[]): 'improving' | 'declining' | 'stable' {
    if (events.length < 3) return 'stable';

    try {
      // Split into first half and second half
      const midpoint = Math.floor(events.length / 2);
      const firstHalf = events.slice(0, midpoint);
      const secondHalf = events.slice(midpoint);

      const firstAvg = this.compute(firstHalf);
      const secondAvg = this.compute(secondHalf);

      const diff = secondAvg - firstAvg;

      if (diff > 0.1) return 'improving';
      if (diff < -0.1) return 'declining';
      return 'stable';
    } catch (error) {
      logger.error({ error }, 'Failed to compute emotional impact trend');
      return 'stable';
    }
  }

  /**
   * Compute emotional volatility (how much sentiment varies)
   */
  computeVolatility(events: InfluenceEvent[]): number {
    if (events.length < 2) return 0;

    try {
      const sentiments = events.map(e => e.sentiment || 0);
      const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

      const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sentiments.length;
      const stdDev = Math.sqrt(variance);

      // Normalize to 0-1 scale
      return Math.min(1, stdDev / 2);
    } catch (error) {
      logger.error({ error }, 'Failed to compute emotional volatility');
      return 0;
    }
  }
}


import { logger } from '../../logger';

import type { LegacySignal } from './types';

/**
 * Scores strength or fragility of legacy
 */
export class LegacyScorer {
  /**
   * Score legacy based on signals
   * Returns score from -1 (fragile) to +1 (strong)
   */
  score(signals: LegacySignal[]): number {
    if (signals.length === 0) return 0;

    try {
      const positive = signals.filter(s => s.direction === 1).length;
      const negative = signals.filter(s => s.direction === -1).length;

      const intensityAvg = signals.reduce((a, b) => a + b.intensity, 0) / signals.length;

      // Score: (positive - negative) * average intensity
      // Normalized to -1 to +1
      const directionScore = (positive - negative) / signals.length;
      const score = directionScore * intensityAvg;

      return Math.max(-1, Math.min(1, score));
    } catch (error) {
      logger.error({ error }, 'Failed to score legacy');
      return 0;
    }
  }

  /**
   * Get legacy strength category
   */
  getStrengthCategory(score: number): 'very_strong' | 'strong' | 'moderate' | 'fragile' | 'very_fragile' {
    if (score >= 0.6) return 'very_strong';
    if (score >= 0.3) return 'strong';
    if (score >= -0.3) return 'moderate';
    if (score >= -0.6) return 'fragile';
    return 'very_fragile';
  }

  /**
   * Calculate legacy consistency (how consistent signals are)
   */
  calculateConsistency(signals: LegacySignal[]): number {
    if (signals.length < 2) return 1;

    try {
      const directions = signals.map(s => s.direction);
      const allSame = directions.every(d => d === directions[0]);

      if (allSame) return 1;

      // Calculate consistency based on direction agreement
      const positiveCount = directions.filter(d => d === 1).length;
      const consistency = Math.max(positiveCount, directions.length - positiveCount) / directions.length;

      return consistency;
    } catch (error) {
      logger.error({ error }, 'Failed to calculate legacy consistency');
      return 0.5;
    }
  }
}


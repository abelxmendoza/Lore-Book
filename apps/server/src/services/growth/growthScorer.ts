import { logger } from '../../logger';

/**
 * Scores overall growth based on multiple factors
 */
export class GrowthScorer {
  /**
   * Score growth based on velocity, breakthroughs, plateaus, and regressions
   */
  score(params: {
    velocity: number;
    breakthroughs: number;
    plateaus: number;
    regressions: number;
    signalCount?: number;
  }): number {
    try {
      const { velocity, breakthroughs, plateaus, regressions, signalCount = 0 } = params;

      // Base score from velocity (normalized to 0-1)
      const velocityScore = Math.max(0, Math.min(1, (velocity + 1) / 2)); // Normalize -1 to +1 to 0 to 1

      // Breakthrough bonus
      const breakthroughBonus = Math.min(1, breakthroughs * 0.3);

      // Plateau penalty
      const plateauPenalty = Math.min(0.5, plateaus * 0.2);

      // Regression penalty
      const regressionPenalty = Math.min(0.8, regressions * 0.4);

      // Signal count bonus (more signals = more activity = potentially more growth)
      const activityBonus = Math.min(0.2, signalCount / 50 * 0.2);

      // Combined score
      const score =
        velocityScore * 0.6 +
        breakthroughBonus * 0.3 -
        plateauPenalty * 0.2 -
        regressionPenalty * 0.4 +
        activityBonus;

      // Clamp between -1 and +1
      return Math.max(-1, Math.min(1, score));
    } catch (error) {
      logger.error({ error }, 'Failed to score growth');
      return 0;
    }
  }

  /**
   * Get growth category
   */
  getCategory(score: number): 'accelerating' | 'growing' | 'stable' | 'declining' | 'stagnant' {
    if (score >= 0.6) return 'accelerating';
    if (score >= 0.2) return 'growing';
    if (score >= -0.2) return 'stable';
    if (score >= -0.6) return 'declining';
    return 'stagnant';
  }
}


import { logger } from '../../logger';
import type { PersonInfluence } from './types';

/**
 * Computes overall net influence score
 */
export class InfluenceScorer {
  /**
   * Compute net influence score
   * Combines emotional impact, behavioral impact, and toxicity
   */
  compute(profile: {
    emotionalImpact: number;
    behavioralImpact: number;
    toxicityScore: number;
    upliftScore: number;
    frequency: number;
  }): number {
    try {
      const { emotionalImpact, behavioralImpact, toxicityScore, upliftScore, frequency } = profile;

      // Base score: weighted combination of emotional and behavioral impact
      let netInfluence = emotionalImpact * 0.4 + behavioralImpact * 0.4;

      // Penalty for toxicity
      netInfluence -= toxicityScore * 0.6;

      // Bonus for uplift
      netInfluence += upliftScore * 0.3;

      // Frequency adjustment (more interactions = more reliable score)
      // But don't let frequency dominate the score
      const frequencyWeight = Math.min(1, frequency / 10); // Normalize frequency
      netInfluence *= 0.7 + frequencyWeight * 0.3;

      // Clamp between -1 and +1
      return Math.max(-1, Math.min(1, netInfluence));
    } catch (error) {
      logger.error({ error }, 'Failed to compute influence score');
      return 0;
    }
  }

  /**
   * Get influence category
   */
  getInfluenceCategory(netInfluence: number): 'highly_positive' | 'positive' | 'neutral' | 'negative' | 'highly_negative' {
    if (netInfluence >= 0.6) return 'highly_positive';
    if (netInfluence >= 0.2) return 'positive';
    if (netInfluence >= -0.2) return 'neutral';
    if (netInfluence >= -0.6) return 'negative';
    return 'highly_negative';
  }
}


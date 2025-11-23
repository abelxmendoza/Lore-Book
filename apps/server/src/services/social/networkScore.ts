import { logger } from '../../logger';
import type { NetworkScore, Community, DriftEvent, InfluenceScore, ToxicitySignal } from './types';

/**
 * Computes overall network health score
 */
export class NetworkScoreService {
  /**
   * Compute network score
   */
  compute(data: {
    communities: Community[];
    drift: DriftEvent[];
    influence: InfluenceScore[];
    toxic: ToxicitySignal[];
    nodes?: number;
    edges?: number;
  }): NetworkScore {
    try {
      // Cohesion: how connected the network is (more communities = more cohesive)
      const cohesion = Math.min(1, data.communities.length / 8);

      // Stability: inverse of fading relationships
      const fadingCount = data.drift.filter(d => d.trend === 'fading').length;
      const stability = Math.max(0, 1 - Math.min(1, fadingCount / 10));

      // Influence balance: distribution of influence (more influencers = better balance)
      const influenceBalance = Math.min(1, data.influence.length / 20);

      // Toxicity level: how toxic the network is
      const toxicCount = data.toxic.length;
      const avgToxicity = data.toxic.length > 0
        ? data.toxic.reduce((sum, t) => sum + t.severity, 0) / data.toxic.length
        : 0;
      const toxicityLevel = Math.min(1, (toxicCount / 10) * 0.5 + avgToxicity * 0.5);

      // Overall score: weighted combination
      const overall = (
        cohesion * 0.25 +
        stability * 0.3 +
        influenceBalance * 0.2 +
        (1 - toxicityLevel) * 0.25
      );

      logger.debug(
        {
          cohesion,
          stability,
          influenceBalance,
          toxicityLevel,
          overall,
        },
        'Computed network score'
      );

      return {
        cohesion,
        stability,
        influenceBalance,
        toxicityLevel,
        overall,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute network score');
      return {
        cohesion: 0.5,
        stability: 0.5,
        influenceBalance: 0.5,
        toxicityLevel: 0.5,
        overall: 0.5,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get network health category
   */
  getCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    if (score >= 0.2) return 'poor';
    return 'critical';
  }
}


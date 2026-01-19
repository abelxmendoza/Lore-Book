import { logger } from '../../logger';

import type { InfluenceEvent } from './types';

/**
 * Computes behavioral impact of interactions
 */
export class BehavioralImpact {
  /**
   * Compute behavioral impact score
   * Positive = growth behaviors, Negative = risk behaviors
   */
  compute(events: InfluenceEvent[]): number {
    if (events.length === 0) return 0;

    try {
      let score = 0;
      let totalBehaviors = 0;

      for (const event of events) {
        for (const tag of event.behavior_tags || []) {
          totalBehaviors++;

          if (tag === 'growth') {
            score += 1;
          } else if (tag === 'risk') {
            score -= 1;
          } else if (tag === 'social') {
            score += 0.2; // Slight positive for social
          }
        }
      }

      // Normalize by number of behaviors
      if (totalBehaviors === 0) return 0;

      // Normalize to -1 to +1 scale
      const normalized = score / Math.max(1, totalBehaviors / 2);
      return Math.max(-1, Math.min(1, normalized));
    } catch (error) {
      logger.error({ error }, 'Failed to compute behavioral impact');
      return 0;
    }
  }

  /**
   * Get behavior breakdown
   */
  getBehaviorBreakdown(events: InfluenceEvent[]): {
    growth: number;
    risk: number;
    social: number;
    total: number;
  } {
    const breakdown = {
      growth: 0,
      risk: 0,
      social: 0,
      total: 0,
    };

    try {
      for (const event of events) {
        for (const tag of event.behavior_tags || []) {
          breakdown.total++;

          if (tag === 'growth') {
            breakdown.growth++;
          } else if (tag === 'risk') {
            breakdown.risk++;
          } else if (tag === 'social') {
            breakdown.social++;
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get behavior breakdown');
    }

    return breakdown;
  }
}


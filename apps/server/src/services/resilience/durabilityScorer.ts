import { logger } from '../../logger';

import type { ResilienceTimelinePoint } from './types';

/**
 * Calculates the final resilience score
 * Based on recovery vs setback differential
 */
export class DurabilityScorer {
  /**
   * Score resilience from timeline
   * Returns score from 0 (low resilience) to 1 (high resilience)
   */
  score(timeline: ResilienceTimelinePoint[]): number {
    if (timeline.length === 0) return 0;

    try {
      let total = 0;
      let count = 0;

      for (const point of timeline) {
        // Calculate resilience differential: recovery - setback
        // Positive means recovery > setback (good resilience)
        // Negative means setback > recovery (poor resilience)
        const diff = point.recovery - point.setback;
        total += diff;
        count++;
      }

      if (count === 0) return 0;

      // Normalize to 0-1 range
      // diff ranges from -1 to +1, so we add 1 and divide by 2
      const averageDiff = total / count;
      const normalized = (averageDiff + 1) / 2;

      return Math.max(0, Math.min(1, normalized));
    } catch (error) {
      logger.error({ error }, 'Failed to score resilience');
      return 0;
    }
  }

  /**
   * Calculate recovery speed (how fast recovery happens)
   */
  calculateRecoverySpeed(timeline: ResilienceTimelinePoint[]): number {
    if (timeline.length === 0) return 0;

    try {
      // Find points with both setback and recovery
      const recoveryPoints = timeline.filter(p => p.setback > 0 && p.recovery > 0);

      if (recoveryPoints.length === 0) return 0;

      // Calculate average recovery rate (recovery / setback ratio)
      const ratios = recoveryPoints.map(p => {
        if (p.setback === 0) return 0;
        return p.recovery / p.setback;
      });

      const averageRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

      // Normalize to 0-1 (ratio of 1+ means full recovery, 0 means no recovery)
      return Math.max(0, Math.min(1, averageRatio));
    } catch (error) {
      logger.error({ error }, 'Failed to calculate recovery speed');
      return 0;
    }
  }

  /**
   * Get resilience category
   */
  getCategory(score: number): 'very_high' | 'high' | 'moderate' | 'low' | 'very_low' {
    if (score >= 0.8) return 'very_high';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'moderate';
    if (score >= 0.2) return 'low';
    return 'very_low';
  }
}


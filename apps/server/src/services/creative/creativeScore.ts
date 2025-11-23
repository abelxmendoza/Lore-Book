import { logger } from '../../logger';
import type { CreativeEvent, FlowState, InspirationSource, CreativeScore } from './types';

/**
 * Computes overall creative scores
 */
export class CreativeScoreService {
  /**
   * Compute creative score
   */
  compute(
    events: CreativeEvent[],
    flow: FlowState[],
    inspiration: InspirationSource[]
  ): CreativeScore {
    try {
      // Output score: based on number of creative events
      const output = Math.min(1, events.length / 20);

      // Consistency score: based on regularity of events
      const consistency = this.computeConsistency(events);

      // Flow score: average flow level
      const flowScore = flow.length > 0
        ? flow.reduce((sum, f) => sum + f.level, 0) / flow.length
        : 0.4;

      // Inspiration score: based on number of inspiration sources
      const inspirationScore = Math.min(1, inspiration.length / 10);

      // Overall weighted score
      const overall = (
        output * 0.3 +
        consistency * 0.25 +
        flowScore * 0.25 +
        inspirationScore * 0.2
      );

      logger.debug(
        {
          output,
          consistency,
          flow: flowScore,
          inspiration: inspirationScore,
          overall,
        },
        'Computed creative score'
      );

      return {
        output,
        consistency,
        flow: flowScore,
        inspiration: inspirationScore,
        overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to compute creative score');
      return {
        output: 0.5,
        consistency: 0.5,
        flow: 0.5,
        inspiration: 0.5,
        overall: 0.5,
      };
    }
  }

  /**
   * Compute consistency (regularity of creative output)
   */
  private computeConsistency(events: CreativeEvent[]): number {
    if (events.length < 2) return 0.3;

    // Sort by timestamp
    const sorted = [...events].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Calculate time intervals between events
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    // Consistency = inverse of coefficient of variation
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 1;

    return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
  }

  /**
   * Get creative health category
   */
  getCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    if (score >= 0.2) return 'poor';
    return 'critical';
  }
}


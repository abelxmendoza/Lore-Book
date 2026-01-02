import type { BehaviorStats, NormalizedBehavior } from './types';

/**
 * Computes behavior pattern statistics
 */
export class BehaviorPatternStats {
  /**
   * Compute frequency statistics for behaviors
   */
  compute(behaviors: NormalizedBehavior[]): BehaviorStats {
    const freq: BehaviorStats = {};

    for (const behavior of behaviors) {
      freq[behavior.behavior] = (freq[behavior.behavior] || 0) + 1;
    }

    return freq;
  }

  /**
   * Get top behaviors by frequency
   */
  getTopBehaviors(stats: BehaviorStats, limit: number = 10): Array<{ behavior: string; count: number }> {
    return Object.entries(stats)
      .map(([behavior, count]) => ({ behavior, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}


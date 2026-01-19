import { logger } from '../../logger';

import type { InfluenceEvent } from './types';

/**
 * Builds influence timeline to track influence over time
 */
export class InfluenceTimeline {
  /**
   * Build timeline from events
   */
  buildTimeline(events: InfluenceEvent[]): Array<{
    timestamp: string;
    sentiment: number;
    behaviors: string[];
  }> {
    try {
      return events.map(e => ({
        timestamp: e.timestamp,
        sentiment: e.sentiment || 0,
        behaviors: e.behavior_tags || [],
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build influence timeline');
      return [];
    }
  }

  /**
   * Detect influence trend (rising or falling)
   */
  detectTrend(events: InfluenceEvent[]): 'rising' | 'falling' | 'stable' {
    if (events.length < 3) return 'stable';

    try {
      // Split into first half and second half
      const midpoint = Math.floor(events.length / 2);
      const firstHalf = events.slice(0, midpoint);
      const secondHalf = events.slice(midpoint);

      const firstAvg = firstHalf.reduce((sum, e) => sum + (e.sentiment || 0), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, e) => sum + (e.sentiment || 0), 0) / secondHalf.length;

      const diff = secondAvg - firstAvg;

      if (diff > 0.1) return 'rising';
      if (diff < -0.1) return 'falling';
      return 'stable';
    } catch (error) {
      logger.error({ error }, 'Failed to detect influence trend');
      return 'stable';
    }
  }

  /**
   * Get recent influence (last N events)
   */
  getRecentInfluence(events: InfluenceEvent[], count: number = 5): {
    averageSentiment: number;
    behaviorBreakdown: Record<string, number>;
  } {
    try {
      const recent = events.slice(-count);
      const averageSentiment = recent.reduce((sum, e) => sum + (e.sentiment || 0), 0) / recent.length;

      const behaviorBreakdown: Record<string, number> = {};
      for (const event of recent) {
        for (const tag of event.behavior_tags || []) {
          behaviorBreakdown[tag] = (behaviorBreakdown[tag] || 0) + 1;
        }
      }

      return {
        averageSentiment,
        behaviorBreakdown,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get recent influence');
      return {
        averageSentiment: 0,
        behaviorBreakdown: {},
      };
    }
  }
}


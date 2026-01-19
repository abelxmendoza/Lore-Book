import { logger } from '../../logger';

import type { DreamSignal, DreamTrajectoryPoint } from './types';

/**
 * Tracks dream clarity and desire over time
 */
export class DreamTrajectory {
  /**
   * Build timeline of dream signals
   */
  buildTimeline(signals: DreamSignal[]): DreamTrajectoryPoint[] {
    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      return sorted.map(d => ({
        timestamp: d.timestamp,
        clarity: d.clarity,
        desire: d.desire,
        category: d.category,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build dream trajectory');
      return [];
    }
  }

  /**
   * Get trajectory summary
   */
  getSummary(timeline: DreamTrajectoryPoint[]): {
    total_points: number;
    average_clarity: number;
    average_desire: number;
    time_span_days: number;
    categories_tracked: number;
  } {
    if (timeline.length === 0) {
      return {
        total_points: 0,
        average_clarity: 0,
        average_desire: 0,
        time_span_days: 0,
        categories_tracked: 0,
      };
    }

    try {
      const totalClarity = timeline.reduce((sum, p) => sum + p.clarity, 0);
      const totalDesire = timeline.reduce((sum, p) => sum + p.desire, 0);

      const categories = new Set(timeline.map(p => p.category));

      const first = new Date(timeline[0].timestamp);
      const last = new Date(timeline[timeline.length - 1].timestamp);
      const timeSpanDays = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

      return {
        total_points: timeline.length,
        average_clarity: totalClarity / timeline.length,
        average_desire: totalDesire / timeline.length,
        time_span_days: timeSpanDays,
        categories_tracked: categories.size,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get trajectory summary');
      return {
        total_points: 0,
        average_clarity: 0,
        average_desire: 0,
        time_span_days: 0,
        categories_tracked: 0,
      };
    }
  }

  /**
   * Detect trajectory trends
   */
  detectTrends(timeline: DreamTrajectoryPoint[]): {
    clarity_trend: 'improving' | 'declining' | 'stable';
    desire_trend: 'increasing' | 'decreasing' | 'stable';
  } {
    if (timeline.length < 3) {
      return {
        clarity_trend: 'stable',
        desire_trend: 'stable',
      };
    }

    try {
      // Compare first third vs last third
      const third = Math.floor(timeline.length / 3);
      const firstThird = timeline.slice(0, third);
      const lastThird = timeline.slice(-third);

      const avgClarityFirst = firstThird.reduce((sum, p) => sum + p.clarity, 0) / firstThird.length;
      const avgClarityLast = lastThird.reduce((sum, p) => sum + p.clarity, 0) / lastThird.length;

      const avgDesireFirst = firstThird.reduce((sum, p) => sum + p.desire, 0) / firstThird.length;
      const avgDesireLast = lastThird.reduce((sum, p) => sum + p.desire, 0) / lastThird.length;

      const clarityDiff = avgClarityLast - avgClarityFirst;
      const desireDiff = avgDesireLast - avgDesireFirst;

      return {
        clarity_trend: clarityDiff > 0.1 ? 'improving' : clarityDiff < -0.1 ? 'declining' : 'stable',
        desire_trend: desireDiff > 0.1 ? 'increasing' : desireDiff < -0.1 ? 'decreasing' : 'stable',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect trajectory trends');
      return {
        clarity_trend: 'stable',
        desire_trend: 'stable',
      };
    }
  }
}


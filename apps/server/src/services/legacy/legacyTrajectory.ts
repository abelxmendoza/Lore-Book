import { logger } from '../../logger';
import type { LegacySignal, LegacyTrajectoryPoint } from './types';

/**
 * Builds long-term significance curves from legacy signals
 */
export class LegacyTrajectory {
  /**
   * Build trajectory from signals
   */
  build(signals: LegacySignal[]): LegacyTrajectoryPoint[] {
    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      return sorted.map(s => ({
        timestamp: s.timestamp,
        significance: s.intensity * s.direction,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build legacy trajectory');
      return [];
    }
  }

  /**
   * Build cumulative trajectory (running total)
   */
  buildCumulative(signals: LegacySignal[]): LegacyTrajectoryPoint[] {
    try {
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      let cumulative = 0;
      return sorted.map(s => {
        cumulative += s.intensity * s.direction;
        return {
          timestamp: s.timestamp,
          significance: cumulative,
        };
      });
    } catch (error) {
      logger.error({ error }, 'Failed to build cumulative legacy trajectory');
      return [];
    }
  }

  /**
   * Get trajectory trend
   */
  getTrend(trajectory: LegacyTrajectoryPoint[]): 'strengthening' | 'weakening' | 'stable' {
    if (trajectory.length < 3) return 'stable';

    try {
      const recent = trajectory.slice(-3);
      const earlier = trajectory.slice(0, 3);

      const recentAvg = recent.reduce((sum, p) => sum + p.significance, 0) / recent.length;
      const earlierAvg = earlier.reduce((sum, p) => sum + p.significance, 0) / earlier.length;

      const diff = recentAvg - earlierAvg;

      if (diff > 0.1) return 'strengthening';
      if (diff < -0.1) return 'weakening';
      return 'stable';
    } catch (error) {
      logger.error({ error }, 'Failed to get trajectory trend');
      return 'stable';
    }
  }

  /**
   * Get trajectory summary
   */
  getSummary(trajectory: LegacyTrajectoryPoint[]): {
    totalPoints: number;
    averageSignificance: number;
    maxSignificance: number;
    minSignificance: number;
    timeSpan: number; // days
  } {
    try {
      if (trajectory.length === 0) {
        return {
          totalPoints: 0,
          averageSignificance: 0,
          maxSignificance: 0,
          minSignificance: 0,
          timeSpan: 0,
        };
      }

      const significances = trajectory.map(p => p.significance);
      const average = significances.reduce((a, b) => a + b, 0) / significances.length;
      const max = Math.max(...significances);
      const min = Math.min(...significances);

      const first = new Date(trajectory[0].timestamp);
      const last = new Date(trajectory[trajectory.length - 1].timestamp);
      const timeSpan = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

      return {
        totalPoints: trajectory.length,
        averageSignificance: average,
        maxSignificance: max,
        minSignificance: min,
        timeSpan,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get trajectory summary');
      return {
        totalPoints: 0,
        averageSignificance: 0,
        maxSignificance: 0,
        minSignificance: 0,
        timeSpan: 0,
      };
    }
  }
}


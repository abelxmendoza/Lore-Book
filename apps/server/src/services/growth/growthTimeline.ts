import { logger } from '../../logger';
import type { GrowthSignal } from './types';

/**
 * Generates growth timeline from signals
 */
export class GrowthTimeline {
  /**
   * Build timeline from signals
   */
  build(signals: GrowthSignal[]): Array<{
    timestamp: string;
    intensity: number;
    direction: 1 | -1;
  }> {
    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      return sorted.map(s => ({
        timestamp: s.timestamp,
        intensity: s.intensity,
        direction: s.direction,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build growth timeline');
      return [];
    }
  }

  /**
   * Build trajectory points (cumulative growth value)
   */
  buildTrajectory(signals: GrowthSignal[]): Array<{
    timestamp: string;
    value: number; // Cumulative value
  }> {
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
          value: cumulative,
        };
      });
    } catch (error) {
      logger.error({ error }, 'Failed to build growth trajectory');
      return [];
    }
  }

  /**
   * Get timeline summary
   */
  getSummary(signals: GrowthSignal[]): {
    totalSignals: number;
    positiveSignals: number;
    negativeSignals: number;
    averageIntensity: number;
    timeSpan: number; // days
  } {
    try {
      if (signals.length === 0) {
        return {
          totalSignals: 0,
          positiveSignals: 0,
          negativeSignals: 0,
          averageIntensity: 0,
          timeSpan: 0,
        };
      }

      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      const first = new Date(sorted[0].timestamp);
      const last = new Date(sorted[sorted.length - 1].timestamp);
      const timeSpan = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

      const positiveSignals = signals.filter(s => s.direction === 1).length;
      const negativeSignals = signals.filter(s => s.direction === -1).length;
      const averageIntensity = signals.reduce((sum, s) => sum + s.intensity, 0) / signals.length;

      return {
        totalSignals: signals.length,
        positiveSignals,
        negativeSignals,
        averageIntensity,
        timeSpan,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get timeline summary');
      return {
        totalSignals: 0,
        positiveSignals: 0,
        negativeSignals: 0,
        averageIntensity: 0,
        timeSpan: 0,
      };
    }
  }
}


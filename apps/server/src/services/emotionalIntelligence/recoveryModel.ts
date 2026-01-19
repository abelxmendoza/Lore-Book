import { logger } from '../../logger';

import type { EmotionSignal, RecoveryPoint } from './types';

/**
 * Estimates how long it takes to emotionally recover from spikes
 */
export class RecoveryModel {
  /**
   * Compute recovery timeline from signals
   */
  compute(signals: EmotionSignal[]): RecoveryPoint[] {
    const recovery: RecoveryPoint[] = [];

    try {
      // Group signals by day
      const grouped: Record<string, number[]> = {};

      for (const signal of signals) {
        const day = new Date(signal.timestamp).toISOString().split('T')[0];

        if (!grouped[day]) {
          grouped[day] = [];
        }

        grouped[day].push(signal.intensity);
      }

      // Calculate average intensity per day
      for (const [day, intensities] of Object.entries(grouped)) {
        const avg = intensities.reduce((sum, i) => sum + i, 0) / intensities.length;

        recovery.push({
          day,
          avg,
          count: intensities.length,
        });
      }

      // Sort by day
      recovery.sort((a, b) => a.day.localeCompare(b.day));

      logger.debug({ points: recovery.length }, 'Computed recovery model');

      return recovery;
    } catch (error) {
      logger.error({ error }, 'Failed to compute recovery model');
      return [];
    }
  }

  /**
   * Calculate average recovery time (days to return to baseline)
   */
  calculateRecoveryTime(signals: EmotionSignal[]): number {
    if (signals.length < 2) return 0;

    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      // Find spikes (intensity > 0.7) and measure recovery time
      const recoveryTimes: number[] = [];

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];

        if (current.intensity > 0.7) {
          // Find when intensity drops below 0.5 (recovered)
          for (let j = i + 1; j < sorted.length; j++) {
            const later = sorted[j];
            const timeDiff = new Date(later.timestamp).getTime() - new Date(current.timestamp).getTime();
            const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

            if (later.intensity < 0.5) {
              recoveryTimes.push(daysDiff);
              break;
            }
          }
        }
      }

      if (recoveryTimes.length === 0) return 0;

      const avgRecoveryTime = recoveryTimes.reduce((sum, t) => sum + t, 0) / recoveryTimes.length;
      return avgRecoveryTime;
    } catch (error) {
      logger.error({ error }, 'Failed to calculate recovery time');
      return 0;
    }
  }

  /**
   * Detect recovery patterns
   */
  detectRecoveryPatterns(recovery: RecoveryPoint[]): {
    fast_recovery: number; // percentage of spikes with fast recovery
    slow_recovery: number; // percentage of spikes with slow recovery
    average_recovery_days: number;
  } {
    if (recovery.length < 2) {
      return {
        fast_recovery: 0,
        slow_recovery: 0,
        average_recovery_days: 0,
      };
    }

    try {
      // Find spikes and recovery
      const spikes: Array<{ day: string; intensity: number; recoveryDay?: string; recoveryDays?: number }> = [];

      for (let i = 0; i < recovery.length; i++) {
        const point = recovery[i];

        if (point.avg > 0.7) {
          // Find recovery (intensity drops below 0.5)
          for (let j = i + 1; j < recovery.length; j++) {
            const later = recovery[j];
            const dayDiff = this.daysBetween(point.day, later.day);

            if (later.avg < 0.5) {
              spikes.push({
                day: point.day,
                intensity: point.avg,
                recoveryDay: later.day,
                recoveryDays: dayDiff,
              });
              break;
            }
          }
        }
      }

      if (spikes.length === 0) {
        return {
          fast_recovery: 0,
          slow_recovery: 0,
          average_recovery_days: 0,
        };
      }

      const fastRecovery = spikes.filter(s => s.recoveryDays && s.recoveryDays <= 1).length;
      const slowRecovery = spikes.filter(s => s.recoveryDays && s.recoveryDays > 3).length;
      const totalRecoveryDays = spikes
        .filter(s => s.recoveryDays !== undefined)
        .reduce((sum, s) => sum + (s.recoveryDays || 0), 0);
      const avgRecoveryDays = totalRecoveryDays / spikes.length;

      return {
        fast_recovery: (fastRecovery / spikes.length) * 100,
        slow_recovery: (slowRecovery / spikes.length) * 100,
        average_recovery_days: avgRecoveryDays,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect recovery patterns');
      return {
        fast_recovery: 0,
        slow_recovery: 0,
        average_recovery_days: 0,
      };
    }
  }

  /**
   * Calculate days between two date strings
   */
  private daysBetween(day1: string, day2: string): number {
    const date1 = new Date(day1);
    const date2 = new Date(day2);
    return (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
  }
}


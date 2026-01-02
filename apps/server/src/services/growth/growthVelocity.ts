import { logger } from '../../logger';
import type { GrowthSignal } from './types';

/**
 * Calculates growth velocity (rate of change)
 */
export class GrowthVelocity {
  /**
   * Compute growth velocity from signals
   * Returns rate of change per day
   */
  compute(signals: GrowthSignal[]): number {
    if (signals.length < 2) return 0;

    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      const deltas: number[] = [];

      for (let i = 1; i < sorted.length; i++) {
        const dt = new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime();
        const days = dt / (1000 * 60 * 60 * 24); // Convert to days

        if (days > 0) {
          // Calculate change in value (intensity * direction)
          const dv = sorted[i].intensity * sorted[i].direction - sorted[i - 1].intensity * sorted[i - 1].direction;
          const velocity = dv / days; // Change per day
          deltas.push(velocity);
        }
      }

      if (deltas.length === 0) return 0;

      // Average velocity
      const average = deltas.reduce((a, b) => a + b, 0) / deltas.length;

      return average;
    } catch (error) {
      logger.error({ error }, 'Failed to compute growth velocity');
      return 0;
    }
  }

  /**
   * Compute recent velocity (last N signals)
   */
  computeRecent(signals: GrowthSignal[], count: number = 5): number {
    if (signals.length < 2) return 0;

    const sorted = [...signals].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    const recent = sorted.slice(-count);
    return this.compute(recent);
  }

  /**
   * Detect velocity spikes (sudden acceleration)
   */
  detectSpike(signals: GrowthSignal[]): boolean {
    if (signals.length < 3) return false;

    try {
      const recentVelocity = this.computeRecent(signals, 3);
      const previousVelocity = this.computeRecent(signals.slice(0, -3), 3);

      // Spike if recent velocity is significantly higher
      return recentVelocity > previousVelocity * 1.5 && recentVelocity > 0.1;
    } catch (error) {
      logger.error({ error }, 'Failed to detect velocity spike');
      return false;
    }
  }
}


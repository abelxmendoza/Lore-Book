import { logger } from '../../logger';
import type { GrowthSignal, GrowthDomain } from './types';

/**
 * Groups and aggregates growth signals
 */
export class GrowthSignals {
  /**
   * Group signals by domain
   */
  group(signals: GrowthSignal[]): Record<GrowthDomain, GrowthSignal[]> {
    const grouped: Record<string, GrowthSignal[]> = {};

    try {
      for (const signal of signals) {
        const domain = signal.domain;

        if (!grouped[domain]) {
          grouped[domain] = [];
        }

        grouped[domain].push(signal);
      }

      // Sort each domain's signals by timestamp
      for (const domain in grouped) {
        grouped[domain].sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB;
        });
      }

      logger.debug({ domains: Object.keys(grouped).length, signals: signals.length }, 'Grouped growth signals');

      return grouped as Record<GrowthDomain, GrowthSignal[]>;
    } catch (error) {
      logger.error({ error }, 'Failed to group growth signals');
      return {} as Record<GrowthDomain, GrowthSignal[]>;
    }
  }

  /**
   * Get signal values (intensity * direction)
   */
  getValues(signals: GrowthSignal[]): number[] {
    return signals.map(s => s.intensity * s.direction);
  }

  /**
   * Get positive signals only
   */
  getPositiveSignals(signals: GrowthSignal[]): GrowthSignal[] {
    return signals.filter(s => s.direction === 1);
  }

  /**
   * Get negative signals (regressions) only
   */
  getNegativeSignals(signals: GrowthSignal[]): GrowthSignal[] {
    return signals.filter(s => s.direction === -1);
  }
}


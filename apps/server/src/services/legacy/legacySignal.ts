import { logger } from '../../logger';
import type { LegacySignal, LegacyDomain } from './types';

/**
 * Normalizes and groups legacy signals
 */
export class LegacySignalService {
  /**
   * Normalize signal intensities to 0-1 range
   */
  normalize(signals: LegacySignal[]): LegacySignal[] {
    try {
      return signals.map(s => ({
        ...s,
        intensity: Math.min(1, Math.max(0, s.intensity)),
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to normalize legacy signals');
      return signals;
    }
  }

  /**
   * Group signals by domain
   */
  byDomain(signals: LegacySignal[]): Record<LegacyDomain, LegacySignal[]> {
    const grouped: Record<string, LegacySignal[]> = {};

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

      logger.debug({ domains: Object.keys(grouped).length }, 'Grouped legacy signals by domain');

      return grouped as Record<LegacyDomain, LegacySignal[]>;
    } catch (error) {
      logger.error({ error }, 'Failed to group legacy signals by domain');
      return {} as Record<LegacyDomain, LegacySignal[]>;
    }
  }

  /**
   * Get positive signals only
   */
  getPositiveSignals(signals: LegacySignal[]): LegacySignal[] {
    return signals.filter(s => s.direction === 1);
  }

  /**
   * Get negative signals only
   */
  getNegativeSignals(signals: LegacySignal[]): LegacySignal[] {
    return signals.filter(s => s.direction === -1);
  }

  /**
   * Calculate average intensity for signals
   */
  getAverageIntensity(signals: LegacySignal[]): number {
    if (signals.length === 0) return 0;

    const sum = signals.reduce((acc, s) => acc + s.intensity, 0);
    return sum / signals.length;
  }
}


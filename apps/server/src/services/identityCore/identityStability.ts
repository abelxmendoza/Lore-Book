import { logger } from '../../logger';

import type { IdentitySignal, IdentityStability } from './identityTypes';

/**
 * Analyzes identity stability
 */
export class IdentityStabilityAnalyzer {
  /**
   * Compute stability metrics
   */
  compute(signals: IdentitySignal[]): IdentityStability {
    try {
      if (signals.length === 0) {
        return {
          volatility: 0,
          anchors: [],
          unstableTraits: [],
        };
      }

      // Calculate volatility based on timestamp spread
      const timestamps = signals.map((s) => new Date(s.timestamp).getTime());
      const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
      const days = timeSpan / (1000 * 60 * 60 * 24);
      const volatility = days > 0 ? Math.min(1, signals.length / (days * 2)) : 0.2;

      // Extract stable anchors (values and beliefs)
      const anchors = signals
        .filter((s) => s.type === 'value' || s.type === 'belief')
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map((s) => s.text.substring(0, 200)); // Limit length

      // Extract unstable traits (fears and shadows)
      const unstableTraits = signals
        .filter((s) => s.type === 'fear' || s.type === 'shadow')
        .map((s) => s.text.substring(0, 200)); // Limit length

      return {
        volatility,
        anchors,
        unstableTraits,
      };
    } catch (error) {
      logger.error({ error }, 'Error computing stability');
      return {
        volatility: 0,
        anchors: [],
        unstableTraits: [],
      };
    }
  }
}


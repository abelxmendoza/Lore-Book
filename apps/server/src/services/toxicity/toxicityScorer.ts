import { logger } from '../../logger';

import type { ToxicityEvent } from './types';

/**
 * Scores toxicity severity
 * More red flags = higher severity
 */
export class ToxicityScorer {
  /**
   * Score toxicity severity
   */
  score(event: ToxicityEvent): number {
    try {
      const base = event.severity || 0;
      const flags = event.redFlags?.length || 0;

      // More flags = higher severity (each flag adds 5%)
      const boosted = base + flags * 0.05;

      return Math.min(1, boosted);
    } catch (error) {
      logger.error({ error, event }, 'Error scoring toxicity');
      return event.severity || 0;
    }
  }
}


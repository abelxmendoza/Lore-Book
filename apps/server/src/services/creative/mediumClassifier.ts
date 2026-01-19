import { logger } from '../../logger';

import type { CreativeEvent, CreativeMedium } from './types';

/**
 * Classifies creative events by medium
 */
export class MediumClassifier {
  /**
   * Classify events by medium and return counts
   */
  classify(events: CreativeEvent[]): Record<CreativeMedium, number> {
    const counts: Record<string, number> = {
      coding: 0,
      art: 0,
      music: 0,
      writing: 0,
      video: 0,
      robotics: 0,
      design: 0,
      performance: 0,
      unknown: 0,
    };

    try {
      events.forEach((e) => {
        counts[e.medium] = (counts[e.medium] || 0) + 1;
      });

      logger.debug({ counts }, 'Classified creative events by medium');

      return counts as Record<CreativeMedium, number>;
    } catch (error) {
      logger.error({ error }, 'Failed to classify mediums');
      return counts as Record<CreativeMedium, number>;
    }
  }

  /**
   * Get top mediums
   */
  getTopMediums(events: CreativeEvent[], topN: number = 5): Array<{ medium: CreativeMedium; count: number }> {
    const counts = this.classify(events);

    return Object.entries(counts)
      .map(([medium, count]) => ({ medium: medium as CreativeMedium, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
}


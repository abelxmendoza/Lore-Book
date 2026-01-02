import { logger } from '../../logger';
import type { TimeEvent, TimeCategory } from './types';

/**
 * Classifies time events by activity category
 */
export class ActivityClassifier {
  /**
   * Classify events by category and return counts
   */
  classify(events: TimeEvent[]): Record<TimeCategory, number> {
    const counts: Record<string, number> = {
      work: 0,
      coding: 0,
      gym: 0,
      bjj: 0,
      muay_thai: 0,
      robotics: 0,
      learning: 0,
      family: 0,
      social: 0,
      travel: 0,
      sleep: 0,
      eating: 0,
      rest: 0,
      errands: 0,
      entertainment: 0,
      unknown: 0,
    };

    try {
      events.forEach((e) => {
        counts[e.category] = (counts[e.category] || 0) + 1;
      });

      logger.debug({ counts }, 'Classified time events by category');

      return counts as Record<TimeCategory, number>;
    } catch (error) {
      logger.error({ error }, 'Failed to classify activities');
      return counts as Record<TimeCategory, number>;
    }
  }

  /**
   * Get top activities
   */
  getTopActivities(events: TimeEvent[], topN: number = 5): Array<{ category: TimeCategory; count: number }> {
    const counts = this.classify(events);

    return Object.entries(counts)
      .map(([category, count]) => ({ category: category as TimeCategory, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }

  /**
   * Get total time spent by category
   */
  getTimeByCategory(events: TimeEvent[]): Record<TimeCategory, number> {
    const timeByCategory: Record<string, number> = {};

    events.forEach((e) => {
      const minutes = e.durationMinutes || 0;
      timeByCategory[e.category] = (timeByCategory[e.category] || 0) + minutes;
    });

    return timeByCategory as Record<TimeCategory, number>;
  }
}


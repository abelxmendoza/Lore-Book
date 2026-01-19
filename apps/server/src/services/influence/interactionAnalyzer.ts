import { logger } from '../../logger';

import type { InfluenceEvent } from './types';

/**
 * Analyzes interactions and groups events by person
 */
export class InteractionAnalyzer {
  /**
   * Build profiles by grouping events by person
   */
  buildProfiles(events: InfluenceEvent[]): Record<string, InfluenceEvent[]> {
    const profiles: Record<string, InfluenceEvent[]> = {};

    try {
      for (const event of events) {
        const person = event.person.toLowerCase().trim();

        if (!profiles[person]) {
          profiles[person] = [];
        }

        profiles[person].push(event);
      }

      // Sort events by timestamp for each person
      for (const person in profiles) {
        profiles[person].sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB;
        });
      }

      logger.debug({ people: Object.keys(profiles).length, events: events.length }, 'Built interaction profiles');

      return profiles;
    } catch (error) {
      logger.error({ error }, 'Failed to build interaction profiles');
      return {};
    }
  }

  /**
   * Get interaction frequency for a person
   */
  getFrequency(events: InfluenceEvent[]): number {
    if (events.length === 0) return 0;

    // Calculate frequency as interactions per week
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    const firstDate = new Date(firstEvent.timestamp);
    const lastDate = new Date(lastEvent.timestamp);

    const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
    const weeks = daysDiff / 7;

    if (weeks === 0) return events.length;

    return events.length / weeks;
  }
}


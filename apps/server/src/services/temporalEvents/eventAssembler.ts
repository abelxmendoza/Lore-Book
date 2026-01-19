import { logger } from '../../logger';

import type { TemporalSignal, AssembledEvent } from './types';

/**
 * Groups temporal signals into candidate events based on time windows
 */
export class EventAssembler {
  private readonly TIME_WINDOW_MINUTES = 180; // 3-hour merge window

  /**
   * Group signals by time window
   */
  group(signals: TemporalSignal[]): TemporalSignal[][] {
    if (signals.length === 0) return [];

    try {
      // Sort signals by timestamp
      const sorted = [...signals].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const events: TemporalSignal[][] = [];
      let bucket: TemporalSignal[] = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const last = bucket[bucket.length - 1];
        const cur = sorted[i];

        const lastTime = new Date(last.timestamp).getTime();
        const curTime = new Date(cur.timestamp).getTime();
        const diffMinutes = Math.abs(curTime - lastTime) / (1000 * 60);

        if (diffMinutes <= this.TIME_WINDOW_MINUTES) {
          // Within time window - add to bucket
          bucket.push(cur);
        } else {
          // Outside time window - start new bucket
          events.push(bucket);
          bucket = [cur];
        }
      }

      // Add final bucket
      if (bucket.length > 0) {
        events.push(bucket);
      }

      logger.debug({ buckets: events.length, signals: signals.length }, 'Grouped signals into events');

      return events;
    } catch (error) {
      logger.error({ error }, 'Failed to group signals');
      return [];
    }
  }

  /**
   * Assemble a bucket of signals into a single event
   */
  assemble(bucket: TemporalSignal[]): AssembledEvent {
    if (bucket.length === 0) {
      throw new Error('Cannot assemble empty bucket');
    }

    const start = bucket[0].timestamp;
    const end = bucket[bucket.length - 1].timestamp;

    // Combine all people, locations, activities (deduplicated)
    const people = [...new Set(bucket.flatMap(b => b.people))];
    const locations = [...new Set(bucket.flatMap(b => b.locations))];
    const activities = [...new Set(bucket.flatMap(b => b.activities))];

    // Combine text
    const summaryText = bucket.map(b => b.text).join('\n');

    return {
      start,
      end,
      people,
      locations,
      activities,
      text: summaryText,
    };
  }
}


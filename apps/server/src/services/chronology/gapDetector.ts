import { parseISO, differenceInDays } from 'date-fns';
import { timeEngine } from '../timeEngine';
import type { Event, Gap } from './types';

/**
 * Detects temporal gaps between events
 */
export class GapDetector {
  private readonly MIN_GAP_DAYS = 3;

  /**
   * Detect gaps in chronological sequence of events
   */
  detect(events: Event[]): Gap[] {
    const gaps: Gap[] = [];

    // Filter events with valid timestamps and sort chronologically
    const eventsWithTimestamps = events
      .filter(e => e.timestamp)
      .map(e => {
        try {
          const ref = timeEngine.parseTimestamp(e.timestamp!);
          return {
            ...e,
            parsedTimestamp: ref.timestamp,
            precision: ref.precision,
          };
        } catch (error) {
          return null;
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => a.parsedTimestamp.getTime() - b.parsedTimestamp.getTime());

    if (eventsWithTimestamps.length < 2) {
      return gaps;
    }

    // Detect gaps between consecutive events
    for (let i = 0; i < eventsWithTimestamps.length - 1; i++) {
      const current = eventsWithTimestamps[i];
      const next = eventsWithTimestamps[i + 1];

      if (!current.timestamp || !next.timestamp) continue;

      try {
        const currentDate = parseISO(current.timestamp);
        const nextDate = parseISO(next.timestamp);
        const diffDays = differenceInDays(nextDate, currentDate);

        if (diffDays > this.MIN_GAP_DAYS) {
          gaps.push({
            start: current.timestamp,
            end: next.timestamp,
            durationDays: diffDays,
            missingEstimate: Math.round(diffDays / 2), // Rough estimate
            metadata: {
              startEventId: current.id,
              endEventId: next.id,
              precision: current.precision,
            },
          });
        }
      } catch (error) {
        // Skip events with invalid timestamps
        continue;
      }
    }

    return gaps;
  }

  /**
   * Detect gaps with custom threshold
   */
  detectWithThreshold(events: Event[], thresholdDays: number): Gap[] {
    const originalThreshold = this.MIN_GAP_DAYS;
    this.MIN_GAP_DAYS = thresholdDays;
    const gaps = this.detect(events);
    this.MIN_GAP_DAYS = originalThreshold;
    return gaps;
  }
}


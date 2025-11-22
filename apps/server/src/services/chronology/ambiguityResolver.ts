import { logger } from '../../logger';
import { timeEngine } from '../timeEngine';
import type { Event } from './types';

/**
 * Resolves temporal ambiguities in events
 */
export class AmbiguityResolver {
  /**
   * Resolve missing or ambiguous timestamps
   */
  resolve(events: Event[]): Event[] {
    return events.map(event => {
      if (!event.timestamp) {
        return {
          ...event,
          timestamp: this.inferTimestamp(event, events),
        };
      }

      // Try to parse and validate existing timestamp
      try {
        const ref = timeEngine.parseTimestamp(event.timestamp);
        if (ref.confidence < 0.5) {
          // Low confidence timestamp, try to improve it
          const inferred = this.inferTimestamp(event, events);
          return {
            ...event,
            timestamp: inferred,
            metadata: {
              ...event.metadata,
              originalTimestamp: event.timestamp,
              inferred: true,
            },
          };
        }
      } catch (error) {
        logger.debug({ error, eventId: event.id }, 'Failed to parse timestamp, inferring');
        return {
          ...event,
          timestamp: this.inferTimestamp(event, events),
          metadata: {
            ...event.metadata,
            originalTimestamp: event.timestamp,
            inferred: true,
          },
        };
      }

      return event;
    });
  }

  /**
   * Infer timestamp from context
   */
  private inferTimestamp(event: Event, allEvents: Event[]): string {
    // Strategy 1: Use median timestamp of similar events (by embedding)
    if (event.embedding && event.embedding.length > 0) {
      const similarEvents = this.findSimilarEvents(event, allEvents);
      if (similarEvents.length > 0) {
        const timestamps = similarEvents
          .map(e => e.timestamp)
          .filter((ts): ts is string => ts !== null)
          .map(ts => {
            try {
              return timeEngine.parseTimestamp(ts).timestamp;
            } catch {
              return null;
            }
          })
          .filter((ts): ts is Date => ts !== null);

        if (timestamps.length > 0) {
          timestamps.sort((a, b) => a.getTime() - b.getTime());
          const median = timestamps[Math.floor(timestamps.length / 2)];
          return median.toISOString();
        }
      }
    }

    // Strategy 2: Use average timestamp of nearby events
    const eventsWithTimestamps = allEvents
      .filter(e => e.timestamp)
      .map(e => {
        try {
          return {
            event: e,
            date: timeEngine.parseTimestamp(e.timestamp!).timestamp,
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (eventsWithTimestamps.length > 0) {
      const avgTime =
        eventsWithTimestamps.reduce((sum, e) => sum + e.date.getTime(), 0) /
        eventsWithTimestamps.length;
      return new Date(avgTime).toISOString();
    }

    // Strategy 3: Default to current time (last resort)
    return new Date().toISOString();
  }

  /**
   * Find similar events based on embedding similarity
   */
  private findSimilarEvents(event: Event, allEvents: Event[], threshold = 0.7): Event[] {
    if (!event.embedding || event.embedding.length === 0) {
      return [];
    }

    const similar: Event[] = [];

    for (const other of allEvents) {
      if (other.id === event.id || !other.embedding || other.embedding.length === 0) {
        continue;
      }

      const similarity = this.cosineSimilarity(event.embedding, other.embedding);
      if (similarity >= threshold) {
        similar.push(other);
      }
    }

    return similar;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}


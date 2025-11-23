import { logger } from '../../logger';
import type { TimeEvent, TimeBlock } from './types';

/**
 * Groups consecutive similar events into time blocks
 */
export class TimeBlockParser {
  /**
   * Parse events into time blocks
   */
  parse(events: TimeEvent[]): TimeBlock[] {
    const blocks: TimeBlock[] = [];

    try {
      if (events.length === 0) return blocks;

      // Sort by timestamp
      const sorted = [...events].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      let current: {
        start: string;
        end: string;
        category: string;
      } | null = null;

      for (const event of sorted) {
        if (!current) {
          // Start new block
          current = {
            start: event.timestamp,
            end: event.timestamp,
            category: event.category,
          };
        } else {
          const sameCategory = event.category === current.category;
          const timeDiff = new Date(event.timestamp).getTime() - new Date(current.end).getTime();
          const minutesDiff = timeDiff / (1000 * 60);
          const close = minutesDiff < 45; // Within 45 minutes

          if (sameCategory && close) {
            // Extend current block
            current.end = event.timestamp;
          } else {
            // Finalize current block and start new one
            const durationMinutes = (new Date(current.end).getTime() - new Date(current.start).getTime()) / (1000 * 60);

            blocks.push({
              id: `block_${current.start}_${Date.now()}`,
              start: current.start,
              end: current.end,
              durationMinutes: Math.max(1, durationMinutes), // At least 1 minute
              category: current.category as any,
              metadata: {},
            });

            // Start new block
            current = {
              start: event.timestamp,
              end: event.timestamp,
              category: event.category,
            };
          }
        }
      }

      // Finalize last block
      if (current) {
        const durationMinutes = (new Date(current.end).getTime() - new Date(current.start).getTime()) / (1000 * 60);

        blocks.push({
          id: `block_${current.start}_${Date.now()}`,
          start: current.start,
          end: current.end,
          durationMinutes: Math.max(1, durationMinutes),
          category: current.category as any,
          metadata: {},
        });
      }

      logger.debug({ blocks: blocks.length, events: events.length }, 'Parsed time blocks');

      return blocks;
    } catch (error) {
      logger.error({ error }, 'Failed to parse time blocks');
      return [];
    }
  }

  /**
   * Get total time by category from blocks
   */
  getTotalTimeByCategory(blocks: TimeBlock[]): Record<string, number> {
    const timeByCategory: Record<string, number> = {};

    blocks.forEach((block) => {
      timeByCategory[block.category] = (timeByCategory[block.category] || 0) + block.durationMinutes;
    });

    return timeByCategory;
  }
}


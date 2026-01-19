import { logger } from '../../logger';

import type { SleepEvent } from './types';

/**
 * Extracts sleep events from journal entries
 */
export class SleepExtractor {
  /**
   * Extract sleep events from entries
   */
  extract(entries: any[]): SleepEvent[] {
    const sleepEvents: SleepEvent[] = [];

    try {
      // Sleep hours patterns
      const sleepHoursPatterns = [
        /slept\s*(\d+(?:\.\d+)?)\s*(hours|hrs|h|hour)/i,
        /got\s*(\d+(?:\.\d+)?)\s*(hours|hrs|h|hour)\s*(of\s*)?sleep/i,
        /(\d+(?:\.\d+)?)\s*(hours|hrs|h|hour)\s*(of\s*)?sleep/i,
        /sleep:\s*(\d+(?:\.\d+)?)/i,
      ];

      // Sleep quality patterns
      const qualityPatterns = [
        { regex: /(good sleep|great sleep|deep sleep|slept well|rested well|quality sleep)/i, value: 0.8 },
        { regex: /(okay sleep|fine sleep|decent sleep|alright sleep)/i, value: 0.6 },
        { regex: /(bad sleep|poor sleep|restless|trouble sleeping|couldn't sleep|insomnia|slept poorly|woke up|interrupted)/i, value: 0.3 },
        { regex: /(excellent sleep|amazing sleep|best sleep|slept like a baby)/i, value: 0.9 },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Extract sleep hours
        let hours: number | null = null;
        for (const pattern of sleepHoursPatterns) {
          const match = content.match(pattern);
          if (match) {
            hours = parseFloat(match[1]);
            // Clamp to reasonable range (0-24 hours)
            hours = Math.max(0, Math.min(24, hours));
            break;
          }
        }

        // Extract sleep quality
        let quality: number | null = null;
        for (const pattern of qualityPatterns) {
          if (pattern.regex.test(contentLower)) {
            quality = pattern.value;
            break;
          }
        }

        // If sleep-related content found (hours or quality), create event
        if (hours !== null || quality !== null || this.isSleepRelated(contentLower)) {
          sleepEvents.push({
            id: `sleep_${entry.id}_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            hours,
            quality,
            evidence: content.substring(0, 500),
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
            },
          });
        }
      }

      logger.debug({ sleepEvents: sleepEvents.length, entries: entries.length }, 'Extracted sleep events');

      return sleepEvents;
    } catch (error) {
      logger.error({ error }, 'Failed to extract sleep events');
      return [];
    }
  }

  /**
   * Check if content is sleep-related
   */
  private isSleepRelated(content: string): boolean {
    const sleepKeywords = [
      'sleep', 'slept', 'bed', 'wake', 'woke', 'insomnia', 'restless',
      'nap', 'tired', 'exhausted', 'rested', 'awake', 'asleep',
    ];
    return sleepKeywords.some(keyword => content.includes(keyword));
  }
}


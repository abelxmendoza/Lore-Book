import { logger } from '../../logger';

import type { TimeEvent, TimeCategory } from './types';

/**
 * Extracts time events from journal entries
 */
export class TimeExtractor {
  /**
   * Extract time events from entries
   */
  extract(entries: any[]): TimeEvent[] {
    const events: TimeEvent[] = [];

    try {
      const patterns: Array<{ cat: TimeCategory; regex: RegExp }> = [
        { cat: 'coding', regex: /(coded|built|vs code|committed|debugged|programmed|wrote code|refactored|deployed)/i },
        { cat: 'robotics', regex: /(robot|raspberry|jetson|ros2|omega|hardware|embedded|arduino)/i },
        { cat: 'gym', regex: /(gym|workout|lifted|weights|strength training|fitness)/i },
        { cat: 'bjj', regex: /(rolled|sparred|bjj|jiu-jitsu|jiujitsu|grappling|submission)/i },
        { cat: 'muay_thai', regex: /(muay thai|kicks|knees|elbows|thai boxing|striking|pads)/i },
        { cat: 'family', regex: /(mom|abuela|family|casa|home|parents|siblings)/i },
        { cat: 'social', regex: /(club|bar|friends|girls|date|party|hangout|social|went out)/i },
        { cat: 'travel', regex: /(drove|traffic|la|hollywood|commute|travel|road trip|trip)/i },
        { cat: 'learning', regex: /(duolingo|studied|read|course|learned|education|training|tutorial)/i },
        { cat: 'sleep', regex: /(slept|nap|tired|rested|bed|woke up|asleep)/i },
        { cat: 'eating', regex: /(ate|food|dinner|lunch|breakfast|meal|restaurant|cooking)/i },
        { cat: 'work', regex: /(shift|restaurant|serve robotics|armstrong|job|work|office|meeting)/i },
        { cat: 'rest', regex: /(rested|relaxed|chilled|took a break|recovery|rest)/i },
        { cat: 'errands', regex: /(errands|shopping|grocery|store|bank|appointment|chores)/i },
        { cat: 'entertainment', regex: /(movie|show|anime|game|played|watched|streaming|netflix)/i },
      ];

      // Duration patterns (e.g., "worked for 2 hours", "spent 30 minutes")
      const durationPatterns = [
        /(?:for|spent|took)\s*(\d+)\s*(?:hours?|hrs?|h)/i,
        /(?:for|spent|took)\s*(\d+)\s*(?:minutes?|mins?|m)/i,
        /(\d+)\s*(?:hours?|hrs?|h)\s*(?:of|on)/i,
        /(\d+)\s*(?:minutes?|mins?|m)\s*(?:of|on)/i,
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for time category patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Try to extract duration
            let durationMinutes: number | undefined;
            for (const durationPattern of durationPatterns) {
              const match = content.match(durationPattern);
              if (match) {
                const value = parseInt(match[1], 10);
                if (durationPattern.source.includes('hour')) {
                  durationMinutes = value * 60;
                } else {
                  durationMinutes = value;
                }
                break;
              }
            }

            events.push({
              id: `time_${entry.id}_${pattern.cat}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              category: pattern.cat,
              description: content.substring(0, 500),
              durationMinutes,
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once
          }
        }
      }

      logger.debug({ events: events.length, entries: entries.length }, 'Extracted time events');

      return events;
    } catch (error) {
      logger.error({ error }, 'Failed to extract time events');
      return [];
    }
  }
}


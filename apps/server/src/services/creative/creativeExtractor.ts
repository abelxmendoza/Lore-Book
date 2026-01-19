import { logger } from '../../logger';

import type { CreativeEvent, CreativeMedium, CreativeAction } from './types';

/**
 * Extracts creative events from journal entries
 */
export class CreativeExtractor {
  /**
   * Extract creative events from entries
   */
  extract(entries: any[]): CreativeEvent[] {
    const events: CreativeEvent[] = [];

    try {
      const patterns: Array<{ medium: CreativeMedium; regex: RegExp; action?: CreativeAction }> = [
        { medium: 'coding', regex: /(coded|built|developed|debugged|committed|programmed|wrote code|refactored|deployed|pushed|git)/i, action: 'worked_on' },
        { medium: 'art', regex: /(drew|sketched|illustrated|art|procreate|painted|digital art|drawing|sketch)/i, action: 'created' },
        { medium: 'music', regex: /(music|song|track|suno|beat|lyrics|composed|produced|recorded music|audio)/i, action: 'created' },
        { medium: 'writing', regex: /(wrote|drafted|scripted|journal|memoir|essay|article|blog|story|novel)/i, action: 'worked_on' },
        { medium: 'video', regex: /(video|recorded|edited|posted|filmed|youtube|tiktok|reel|content creation)/i, action: 'created' },
        { medium: 'robotics', regex: /(robot|raspberry|jetson|ros2|omega|hardware|embedded|arduino|circuit)/i, action: 'worked_on' },
        { medium: 'design', regex: /(designed|layout|figma|ui|logo|graphic design|branding|wireframe|prototype)/i, action: 'created' },
        { medium: 'performance', regex: /(performed|sparred|rolled|competed|show|gig|concert|stage|act)/i, action: 'performed' },
      ];

      // Action detection patterns
      const actionPatterns: Array<{ action: CreativeAction; regex: RegExp }> = [
        { action: 'published', regex: /(published|released|launched|posted|shared|uploaded)/i },
        { action: 'planned', regex: /(planning|planning to|going to|will create|idea for)/i },
        { action: 'thought_about', regex: /(thinking about|considering|mulling over|contemplating)/i },
        { action: 'completed', regex: /(finished|completed|done|wrapped up|finalized)/i },
        { action: 'abandoned', regex: /(gave up|stopped|abandoned|dropped|quit on)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for creative medium patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Determine action
            let action: CreativeAction = pattern.action || 'worked_on';
            
            // Check for specific action patterns
            for (const actionPattern of actionPatterns) {
              if (actionPattern.regex.test(contentLower)) {
                action = actionPattern.action;
                break;
              }
            }

            events.push({
              id: `creative_${entry.id}_${pattern.medium}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              medium: pattern.medium,
              action,
              description: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
              },
            });
          }
        }
      }

      logger.debug({ events: events.length, entries: entries.length }, 'Extracted creative events');

      return events;
    } catch (error) {
      logger.error({ error }, 'Failed to extract creative events');
      return [];
    }
  }
}


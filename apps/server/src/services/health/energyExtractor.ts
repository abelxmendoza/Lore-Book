import { logger } from '../../logger';

import type { EnergyEvent } from './types';

/**
 * Extracts energy level events from journal entries
 */
export class EnergyExtractor {
  /**
   * Extract energy events from entries
   */
  extract(entries: any[]): EnergyEvent[] {
    const energyEvents: EnergyEvent[] = [];

    try {
      const patterns: Array<{ regex: RegExp; val: number }> = [
        { regex: /(energetic|charged|awake|ready|pumped|energized|full of energy|high energy|burst of energy)/i, val: 0.8 },
        { regex: /(okay|fine|normal|alright|decent|moderate|average energy)/i, val: 0.5 },
        { regex: /(tired|drained|exhausted|low energy|no energy|worn out|beat|spent|depleted)/i, val: 0.2 },
        { regex: /(super energetic|amazing energy|incredible energy|unstoppable|on fire)/i, val: 0.95 },
        { regex: /(completely drained|no energy at all|can't move|dead tired|wiped out)/i, val: 0.1 },
        { regex: /(feeling good|feeling great|feeling strong|feeling powerful)/i, val: 0.7 },
        { regex: /(sluggish|slow|lethargic|groggy|drowsy)/i, val: 0.3 },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for energy patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            energyEvents.push({
              id: `energy_${entry.id}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              level: pattern.val,
              evidence: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once
          }
        }
      }

      logger.debug({ energyEvents: energyEvents.length, entries: entries.length }, 'Extracted energy events');

      return energyEvents;
    } catch (error) {
      logger.error({ error }, 'Failed to extract energy events');
      return [];
    }
  }

  /**
   * Get average energy level
   */
  getAverageEnergy(events: EnergyEvent[]): number {
    if (events.length === 0) return 0.5;

    const total = events.reduce((sum, e) => sum + e.level, 0);
    return total / events.length;
  }

  /**
   * Get energy trend
   */
  getEnergyTrend(events: EnergyEvent[]): 'increasing' | 'decreasing' | 'stable' {
    if (events.length < 3) return 'stable';

    // Sort by timestamp
    const sorted = [...events].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB;
    });

    // Compare first third vs last third
    const third = Math.floor(sorted.length / 3);
    const firstThird = sorted.slice(0, third);
    const lastThird = sorted.slice(-third);

    const avgFirst = firstThird.reduce((sum, e) => sum + e.level, 0) / firstThird.length;
    const avgLast = lastThird.reduce((sum, e) => sum + e.level, 0) / lastThird.length;

    const diff = avgLast - avgFirst;

    if (diff > 0.1) return 'increasing';
    if (diff < -0.1) return 'decreasing';
    return 'stable';
  }
}


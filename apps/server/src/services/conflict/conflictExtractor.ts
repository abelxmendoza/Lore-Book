import { logger } from '../../logger';

import type { RawConflictSignal } from './types';

/**
 * Extracts raw conflict signals from journal entries
 */
export class ConflictExtractor {
  private readonly conflictKeywords = [
    /(fight|fought|fighting)/i,
    /(argument|argued|arguing)/i,
    /(confront|confrontation|confronted)/i,
    /(punch|punched|swing|swung|hit|hitting)/i,
    /(yell|yelled|scream|screamed|shout|shouted)/i,
    /(attack|attacked|aggressive|aggression)/i,
    /(violence|violent|assault)/i,
    /(threat|threatened|threatening)/i,
    /(drama|dramatic|escalated|escalation)/i,
    /(intimidat|intimidation|bully|bullied)/i,
    /(manipulat|manipulation|manipulated)/i,
    /(breakdown|meltdown|exploded|explosion)/i,
    /(regret|regretted|aftermath|aftershock)/i,
    /(spar|sparring|rolled|rolling)/i,
    /(venue|club|bar|nightlife)/i,
  ];

  /**
   * Detect conflict signals from entries
   */
  detect(entries: any[]): RawConflictSignal[] {
    const signals: RawConflictSignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        // Check if entry contains conflict-related keywords
        const hasConflict = this.conflictKeywords.some((pattern) => pattern.test(entry.text));

        if (hasConflict) {
          signals.push({
            memoryId: entry.id,
            text: entry.text,
            timestamp: entry.timestamp,
          });
        }
      }

      logger.debug({ count: signals.length }, 'Extracted conflict signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting conflict signals');
    }

    return signals;
  }
}


import { logger } from '../../logger';

import type { ToxicitySignal } from './types';

/**
 * Extracts raw toxicity signals from journal entries
 */
export class ToxicitySignalExtractor {
  private readonly toxicityKeywords = [
    /(jealous|jealousy|envious|envy)/i,
    /(manipulat|manipulation|manipulated|manipulative)/i,
    /(disrespect|disrespected|disrespectful)/i,
    /(hostile|hostility|aggressive|aggression)/i,
    /(betray|betrayal|betrayed|backstab)/i,
    /(chaos|chaotic|unstable|instability)/i,
    /(sabotage|sabotaged|undermine|undermining)/i,
    /(blame|blaming|blame shift|blame shifting)/i,
    /(dominance|dominate|dominating|power play)/i,
    /(danger|dangerous|risky|risk)/i,
    /(red flag|red flags|warning sign|warning signs)/i,
    /(toxic|toxicity|poisonous|harmful)/i,
    /(gaslight|gaslighting|gaslit)/i,
    /(narcissist|narcissistic|narcissism)/i,
    /(abuse|abusive|abused)/i,
  ];

  /**
   * Detect toxicity signals from entries
   */
  detect(entries: any[]): ToxicitySignal[] {
    const signals: ToxicitySignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        // Check if entry contains toxicity-related keywords
        const hasToxicity = this.toxicityKeywords.some((pattern) => pattern.test(entry.text));

        if (hasToxicity) {
          signals.push({
            memoryId: entry.id,
            text: entry.text,
            timestamp: entry.timestamp,
          });
        }
      }

      logger.debug({ count: signals.length }, 'Extracted toxicity signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting toxicity signals');
    }

    return signals;
  }
}


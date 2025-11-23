import { logger } from '../../logger';
import type { RawBehaviorSignal } from './types';

/**
 * Extracts raw behavior signals from journal entries
 */
export class BehaviorExtractor {
  private readonly patterns = [
    { behavior: 'drinking', regex: /(drank|drinking|got drunk|alcohol|liquor|beer|wine|cocktail)/i },
    { behavior: 'flirting', regex: /(flirt|talked to a girl|rizzed|hit on|chatted up|made a move)/i },
    { behavior: 'sparring', regex: /(spar|rolled|fought|bjj|muay thai|boxing|grappling)/i },
    { behavior: 'avoidance', regex: /(avoided|ignored|didn't respond|put off|procrastinated|delayed)/i },
    { behavior: 'overthinking', regex: /(overthink|spiraling|paranoid|ruminating|obsessing|anxious thoughts)/i },
    { behavior: 'impulse', regex: /(did it without thinking|impulsive|rushed|acted on impulse|spur of the moment)/i },
    { behavior: 'grinding', regex: /(coding spree|trained hard|worked nonstop|grinding|hustling|deep work)/i },
    { behavior: 'self-criticism', regex: /(felt like a loser|i fucked up|i messed up|i'm terrible|self-doubt)/i },
    { behavior: 'socializing', regex: /(hung out|went out|party|social event|gathering|meetup)/i },
    { behavior: 'exercise', regex: /(worked out|gym|training|exercise|ran|jogged|lifted)/i },
    { behavior: 'gaming', regex: /(played games|gaming|video game|console|steam)/i },
    { behavior: 'shopping', regex: /(bought|shopping|purchased|spent money|retail therapy)/i },
  ];

  /**
   * Extract behavior signals from entries
   */
  extract(entries: any[]): RawBehaviorSignal[] {
    const signals: RawBehaviorSignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text.toLowerCase();

        for (const pattern of this.patterns) {
          if (pattern.regex.test(entry.text)) {
            signals.push({
              memoryId: entry.id,
              text: entry.text,
              behavior: pattern.behavior,
              timestamp: entry.timestamp,
            });
            // Don't break - one entry can have multiple behaviors
          }
        }
      }

      logger.debug({ count: signals.length }, 'Extracted behavior signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting behaviors');
    }

    return signals;
  }
}


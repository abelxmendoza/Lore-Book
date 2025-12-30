import { logger } from '../../logger';
import { randomUUID } from 'crypto';
import type { IdentitySignal, IdentityDimension } from './identityTypes';

/**
 * Builds identity dimensions from signals
 */
export class IdentityDimensionBuilder {
  /**
   * Build dimensions from signals
   */
  build(signals: IdentitySignal[]): IdentityDimension[] {
    const dimensions: IdentityDimension[] = [];

    try {
      const addDim = (name: string, filter: (s: IdentitySignal) => boolean) => {
        const match = signals.filter(filter);
        if (match.length > 0) {
          dimensions.push({
            id: randomUUID(),
            name,
            score: Math.min(1, match.length / 10),
            signals: match,
          });
        }
      };

      // Classic identity dimensions
      addDim('Warrior', (s) => /fight|overcome|strength|battle|conquer|defeat/i.test(s.text));
      addDim('Creator', (s) => /build|create|invent|design|make|craft|art/i.test(s.text));
      addDim('Explorer', (s) => /explore|learn|curious|discover|adventure|journey|travel/i.test(s.text));
      addDim('Rebel', (s) => /break rules|against|not like others|defy|resist|challenge authority/i.test(s.text));
      addDim('Guardian', (s) => /protect|care|support|defend|nurture|help|save/i.test(s.text));
      addDim('Shadow', (s) => s.type === 'shadow');
      addDim('Sage', (s) => /wisdom|knowledge|teach|understand|insight|learned/i.test(s.text));
      addDim('Lover', (s) => /love|connection|intimacy|passion|romance|affection/i.test(s.text));
      addDim('Hero', (s) => /hero|save|rescue|help others|make a difference|impact/i.test(s.text));
      addDim('Seeker', (s) => /search|find|seek|quest|mission|purpose|meaning/i.test(s.text));

      logger.debug({ count: dimensions.length }, 'Built identity dimensions');
    } catch (error) {
      logger.error({ error }, 'Error building dimensions');
    }

    return dimensions;
  }
}


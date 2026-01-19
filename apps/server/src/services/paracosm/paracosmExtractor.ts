import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { ParacosmElement, ParacosmCategory } from './paracosmTypes';

/**
 * Extracts paracosm elements from journal entries
 * Identifies imagined worlds, scenarios, people, and mental simulations
 */
export class ParacosmExtractor {
  private readonly patterns: Array<{ cat: ParacosmCategory; regex: RegExp }> = [
    { cat: 'imagined_person', regex: /(i imagine|i pictured|i thought of|if i met|imagined meeting)/i },
    { cat: 'imagined_group', regex: /(their friend group|people i haven't met|imagined group|hypothetical group)/i },
    { cat: 'imagined_future', regex: /(future|what if i|in a different life|future me|future version)/i },
    { cat: 'alternate_self', regex: /(other version of me|if i was|alternate me|different me|parallel me)/i },
    { cat: 'fantasy_scenario', regex: /(fantasy|dream scenario|epic scene|fantasy world|fantasy situation)/i },
    { cat: 'inner_world', regex: /(in my head|in my mind|my world|inner world|mental world)/i },
    { cat: 'simulation', regex: /(simulate|ran a scenario|mental simulation|played out|envisioned)/i },
    { cat: 'fictional_entity', regex: /(character|hero|villain|anime|fiction|fictional character|made up)/i },
    { cat: 'fictional_location', regex: /(imaginary place|city|universe|fictional world|made up place)/i },
    { cat: 'fear_projection', regex: /(what if they hate me|they might attack|worst case|fear scenario|afraid they)/i },
    { cat: 'ideal_projection', regex: /(ideal version|perfect world|best case|ideal scenario|dream come true)/i },
    { cat: 'daydream', regex: /(daydream|spaced out|lost in thought|zoned out|daydreaming)/i },
    { cat: 'nightmare', regex: /(nightmare|dark scenario|bad vision|worst nightmare|terrifying scenario)/i },
  ];

  /**
   * Extract paracosm elements from entries
   */
  extract(entries: any[]): ParacosmElement[] {
    const out: ParacosmElement[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text;

        for (const pattern of this.patterns) {
          if (pattern.regex.test(text)) {
            // Calculate vividness based on detail level
            const detailWords = (text.match(/\b(very|extremely|incredibly|highly|deeply|intensely)\b/gi) || []).length;
            const vividness = Math.min(1, 0.3 + detailWords * 0.1);

            // Calculate emotional intensity based on emotional words
            const emotionalWords = (text.match(/\b(excited|thrilled|terrified|anxious|hopeful|desperate|ecstatic|devastated)\b/gi) || []).length;
            const emotional_intensity = Math.min(1, 0.2 + emotionalWords * 0.15);

            out.push({
              id: randomUUID(),
              category: pattern.cat,
              text: text,
              evidence: text,
              timestamp: entry.timestamp,
              confidence: 0.7,
              vividness,
              emotional_intensity,
              memory_id: entry.id,
            });
            // Don't break - one entry can have multiple paracosm elements
          }
        }
      }

      logger.debug({ count: out.length }, 'Extracted paracosm elements');
    } catch (error) {
      logger.error({ error }, 'Error extracting paracosm elements');
    }

    return out;
  }
}


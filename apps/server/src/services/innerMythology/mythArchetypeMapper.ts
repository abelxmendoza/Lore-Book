import { logger } from '../../logger';
import type { MythElement, MythArchetype } from './mythTypes';

/**
 * Maps myth elements to archetypal patterns
 */
export class MythArchetypeMapper {
  /**
   * Map elements to archetypes
   */
  map(elements: MythElement[]): MythArchetype[] {
    const archetypes: MythArchetype[] = [];

    try {
      const add = (name: string, filter: (e: MythElement) => boolean) => {
        const match = elements.filter(filter);
        if (match.length > 0) {
          archetypes.push({
            archetype: name,
            evidence: match.map((m) => m.text),
          });
        }
      };

      add('Hero', (e) => e.category === 'hero');
      add('Shadow', (e) => e.category === 'shadow');
      add('Mentor', (e) => e.category === 'guide');
      add('Threshold Guardian', (e) => e.category === 'guardian');
      add('Monster', (e) => e.category === 'monster');
      add('Temptation', (e) => e.category === 'temptation');
      add('Villain', (e) => e.category === 'villain');
      add('Quest', (e) => e.category === 'quest');
      add('Prophecy', (e) => e.category === 'prophecy');
      add('Symbol', (e) => e.category === 'symbol');
      add('Obstacle', (e) => e.category === 'obstacle');
      add('Inner Realm', (e) => e.category === 'inner_realm');

      logger.debug({ count: archetypes.length }, 'Mapped myth archetypes');
    } catch (error) {
      logger.error({ error }, 'Error mapping archetypes');
    }

    return archetypes;
  }
}


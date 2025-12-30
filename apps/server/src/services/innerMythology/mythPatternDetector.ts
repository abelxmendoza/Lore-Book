import { logger } from '../../logger';
import { randomUUID } from 'crypto';
import type { MythElement, MythMotif } from './mythTypes';

/**
 * Detects mythological motifs and patterns
 */
export class MythPatternDetector {
  /**
   * Detect motifs from elements
   */
  detect(elements: MythElement[]): MythMotif[] {
    const motifs: MythMotif[] = [];

    try {
      const motif = (name: string, regex: RegExp): MythMotif => ({
        id: randomUUID(),
        motifType: name,
        elements: elements.filter((e) => regex.test(e.text)),
      });

      // Classic mythological motifs
      motifs.push(motif('Rebirth', /(started over|fresh start|reborn|renewal|resurrection|new beginning)/i));
      motifs.push(motif('Trial', /(struggle|fight|challenge|test|ordeal|trial|battle)/i));
      motifs.push(motif('Calling', /(destined|meant to|purpose|calling|vocation|fate)/i));
      motifs.push(motif('Shadow Conflict', /(sabotage|dark side|fear|inner conflict|self-destruction)/i));
      motifs.push(motif('Hero Journey', /(journey|quest|adventure|mission|epic|odyssey)/i));
      motifs.push(motif('Transformation', /(changed|transformed|evolved|became|shifted|metamorphosis)/i));
      motifs.push(motif('Sacrifice', /(gave up|sacrificed|let go|surrendered|abandoned)/i));
      motifs.push(motif('Return', /(came back|returned|homecoming|reunion|reconnection)/i));
      motifs.push(motif('Threshold', /(crossed|entered|passed|stepped into|new realm)/i));
      motifs.push(motif('Atonement', /(forgave|made amends|reconciled|healed|repaired)/i));
      motifs.push(motif('Rescue', /(saved|rescued|helped|protected|defended)/i));
      motifs.push(motif('Revelation', /(realized|understood|saw clearly|enlightened|awakened)/i));

      const validMotifs = motifs.filter((m) => m.elements.length > 0);

      logger.debug({ count: validMotifs.length }, 'Detected myth motifs');
      return validMotifs;
    } catch (error) {
      logger.error({ error }, 'Error detecting motifs');
      return [];
    }
  }
}


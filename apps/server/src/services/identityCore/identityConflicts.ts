import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { IdentitySignal, IdentityConflict } from './identityTypes';

/**
 * Detects identity conflicts
 */
export class IdentityConflictDetector {
  /**
   * Detect conflicts from signals
   */
  detect(signals: IdentitySignal[]): IdentityConflict[] {
    const conflicts: IdentityConflict[] = [];

    try {
      // Conflict pairs to detect
      const pairs: Array<[string, string]> = [
        ['Warrior', 'Peacemaker'],
        ['Rebel', 'Conformer'],
        ['Dreamer', 'Realist'],
        ['Shadow', 'Ideal Self'],
        ['Creator', 'Destroyer'],
        ['Guardian', 'Warrior'],
        ['Explorer', 'Homebody'],
        ['Lover', 'Loner'],
      ];

      for (const [a, b] of pairs) {
        const aHits = signals.filter((s) => new RegExp(a, 'i').test(s.text));
        const bHits = signals.filter((s) => new RegExp(b, 'i').test(s.text));

        if (aHits.length > 0 && bHits.length > 0) {
          conflicts.push({
            id: randomUUID(),
            conflictName: `${a} vs ${b}`,
            positiveSide: a,
            negativeSide: b,
            evidence: [...aHits.map((e) => e.text), ...bHits.map((e) => e.text)],
            tension: Math.min(1, (aHits.length + bHits.length) / 10),
          });
        }
      }

      logger.debug({ count: conflicts.length }, 'Detected identity conflicts');
    } catch (error) {
      logger.error({ error }, 'Error detecting conflicts');
    }

    return conflicts;
  }
}


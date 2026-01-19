import { logger } from '../../logger';

import type { ValueCategory } from './types';

/**
 * Checks if your behavior matches your stated values
 */
export class AlignmentDetector {
  /**
   * Detect misalignments between values and behavior
   */
  detectAlignment(
    values: string[],
    entries: any[]
  ): string[] {
    const misalignments: string[] = [];

    try {
      for (const value of values) {
        const violations = this.findViolations(value, entries);

        if (violations.length > 0) {
          misalignments.push(`${value}: ${violations.length} misalignment(s)`);
        }
      }

      logger.debug({ misalignments: misalignments.length, values: values.length }, 'Detected value misalignments');

      return misalignments;
    } catch (error) {
      logger.error({ error }, 'Failed to detect alignment');
      return [];
    }
  }

  /**
   * Find entries that violate a value
   */
  private findViolations(value: string, entries: any[]): any[] {
    const violations: any[] = [];

    // Value-specific violation patterns
    const violationPatterns: Record<string, RegExp[]> = {
      discipline: [
        /(ignored|avoided|skipped|missed|didn't do|procrastinated|lazy|slacked).*(routine|work|practice|training|discipline)/i,
        /(gave up|quit|stopped).*(goal|plan|commitment)/i,
      ],
      loyalty: [
        /(betrayed|backstabbed|went behind|lied to|deceived).*(friend|family|team|trust)/i,
        /(abandoned|left|ditched).*(friend|family|team)/i,
      ],
      honor: [
        /(cheated|lied|stole|betrayed|deceived|manipulated)/i,
        /(went against|violated|broke).*(principle|ethics|integrity|moral)/i,
      ],
      ambition: [
        /(gave up|quit|abandoned|stopped).*(goal|dream|plan|ambition)/i,
        /(settled|accepted|gave in).*(less|mediocre|average)/i,
      ],
      freedom: [
        /(trapped|stuck|confined|restricted|controlled|limited)/i,
        /(can't|unable to).*(choose|decide|be myself)/i,
      ],
      growth: [
        /(stayed the same|didn't improve|no progress|stagnant)/i,
        /(avoided|ignored|rejected).*(learning|challenge|opportunity)/i,
      ],
      courage: [
        /(backed down|chickened out|afraid|scared|avoided).*(risk|challenge|confront)/i,
        /(didn't stand up|stayed silent|didn't speak up)/i,
      ],
      creativity: [
        /(didn't create|avoided|ignored).*(art|creative|build|invent)/i,
        /(stuck|blocked|uninspired|creative block)/i,
      ],
      justice: [
        /(ignored|stood by|didn't help|didn't defend).*(unfair|wrong|injustice)/i,
        /(treated|judged).*(unfairly|unjustly)/i,
      ],
    };

    const patterns = violationPatterns[value.toLowerCase()] || [
      new RegExp(`(ignored|avoided|betrayed|went against).*${value}`, 'i'),
    ];

    for (const entry of entries) {
      const content = (entry.content || entry.text || '').toLowerCase();

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push(entry);
          break; // Count each entry only once
        }
      }
    }

    return violations;
  }

  /**
   * Calculate alignment score for a value (0-1)
   */
  calculateAlignmentScore(value: string, entries: any[]): number {
    const violations = this.findViolations(value, entries);
    const totalEntries = entries.length;

    if (totalEntries === 0) return 1;

    // Alignment score: 1 - (violations / total entries)
    const violationRate = violations.length / totalEntries;
    return Math.max(0, 1 - violationRate);
  }
}


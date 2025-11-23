import { logger } from '../../logger';
import type { ValueCategory } from './types';

/**
 * Detects contradictions between your stated values
 */
export class ValueConflictDetector {
  /**
   * Detect value conflicts from grouped values
   */
  detect(groups: Record<string, any[]>): string[] {
    const conflicts: string[] = [];

    try {
      // Known value conflicts
      const conflictPairs: Array<[ValueCategory, ValueCategory, string]> = [
        ['discipline', 'freedom', 'discipline_vs_freedom'],
        ['loyalty', 'ambition', 'loyalty_vs_ambition'],
        ['honor', 'ambition', 'honor_vs_ambition'],
        ['stability', 'adventure', 'stability_vs_adventure'],
        ['independence', 'community', 'independence_vs_community'],
        ['freedom', 'loyalty', 'freedom_vs_loyalty'],
        ['creativity', 'stability', 'creativity_vs_stability'],
        ['justice', 'loyalty', 'justice_vs_loyalty'],
        ['courage', 'stability', 'courage_vs_stability'],
        ['growth', 'stability', 'growth_vs_stability'],
      ];

      // Check for conflicting value pairs
      for (const [value1, value2, conflictName] of conflictPairs) {
        const hasValue1 = groups[value1] && groups[value1].length > 0;
        const hasValue2 = groups[value2] && groups[value2].length > 0;

        if (hasValue1 && hasValue2) {
          // Both values are present - potential conflict
          conflicts.push(conflictName);
        }
      }

      logger.debug({ conflicts: conflicts.length }, 'Detected value conflicts');

      return conflicts;
    } catch (error) {
      logger.error({ error }, 'Failed to detect value conflicts');
      return [];
    }
  }

  /**
   * Get conflict severity (how strong the conflict is)
   */
  getConflictSeverity(
    groups: Record<string, any[]>,
    conflictName: string
  ): 'low' | 'medium' | 'high' {
    try {
      const [value1, value2] = conflictName.split('_vs_');

      const group1 = groups[value1] || [];
      const group2 = groups[value2] || [];

      const strength1 = group1.reduce((sum, s) => sum + (s.strength || 0), 0) / group1.length || 0;
      const strength2 = group2.reduce((sum, s) => sum + (s.strength || 0), 0) / group2.length || 0;

      const avgStrength = (strength1 + strength2) / 2;

      if (avgStrength > 0.7) return 'high';
      if (avgStrength > 0.4) return 'medium';
      return 'low';
    } catch (error) {
      logger.error({ error }, 'Failed to get conflict severity');
      return 'low';
    }
  }
}


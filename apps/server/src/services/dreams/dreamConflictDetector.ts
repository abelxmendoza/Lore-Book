import { logger } from '../../logger';

import type { DreamCategory } from './types';

/**
 * Detects contradictions between dreams
 */
export class DreamConflictDetector {
  /**
   * Detect dream conflicts from grouped dreams
   */
  detect(groups: Record<string, any[]>): string[] {
    const conflicts: string[] = [];

    try {
      // Known dream conflicts (time/energy/resource conflicts)
      const conflictPairs: Array<[DreamCategory, DreamCategory, string]> = [
        ['martial', 'career', 'martial_vs_career'], // time/energy conflict
        ['lifestyle', 'financial', 'travel_vs_saving'], // spending vs saving
        ['relationship', 'career', 'relationship_vs_workaholic'], // time conflict
        ['creative', 'career', 'creative_vs_career'], // time conflict
        ['adventure', 'financial', 'adventure_vs_saving'], // spending vs saving
        ['family', 'career', 'family_vs_career'], // time conflict
        ['health', 'career', 'health_vs_career'], // time conflict
        ['education', 'career', 'education_vs_career'], // time conflict
        ['lifestyle', 'career', 'lifestyle_vs_career'], // location/time conflict
      ];

      // Check for conflicting dream pairs
      for (const [dream1, dream2, conflictName] of conflictPairs) {
        const hasDream1 = groups[dream1] && groups[dream1].length > 0;
        const hasDream2 = groups[dream2] && groups[dream2].length > 0;

        if (hasDream1 && hasDream2) {
          // Both dreams are present - potential conflict
          conflicts.push(conflictName);
        }
      }

      logger.debug({ conflicts: conflicts.length }, 'Detected dream conflicts');

      return conflicts;
    } catch (error) {
      logger.error({ error }, 'Failed to detect dream conflicts');
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
      const [dream1, dream2] = conflictName.split('_vs_');

      const group1 = groups[dream1] || [];
      const group2 = groups[dream2] || [];

      const avgDesire1 = group1.reduce((sum, d) => sum + (d.desire || 0), 0) / group1.length || 0;
      const avgDesire2 = group2.reduce((sum, d) => sum + (d.desire || 0), 0) / group2.length || 0;

      const avgDesire = (avgDesire1 + avgDesire2) / 2;

      if (avgDesire > 0.7) return 'high';
      if (avgDesire > 0.4) return 'medium';
      return 'low';
    } catch (error) {
      logger.error({ error }, 'Failed to get conflict severity');
      return 'low';
    }
  }
}


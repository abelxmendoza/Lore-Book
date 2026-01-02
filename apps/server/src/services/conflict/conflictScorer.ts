import { logger } from '../../logger';
import type { Conflict } from './types';

/**
 * Scores conflict intensity with weighted algorithm
 */
export class ConflictScorer {
  /**
   * Score conflict intensity
   * Physical conflicts get a multiplier boost
   */
  score(conflict: Conflict): number {
    try {
      const base = conflict.intensity || 0;

      // Check if conflict has physical elements
      const hasPhysical =
        conflict.conflictBeats?.some(
          (beat) =>
            beat.stage?.toLowerCase().includes('push') ||
            beat.stage?.toLowerCase().includes('swing') ||
            beat.stage?.toLowerCase().includes('punch') ||
            beat.stage?.toLowerCase().includes('hit') ||
            beat.stage?.toLowerCase().includes('strike') ||
            beat.stage?.toLowerCase().includes('physical')
        ) || conflict.type?.toLowerCase() === 'physical';

      // Physical conflicts get intensity multiplier
      const multiplier = hasPhysical ? 1.4 : 1.0;

      return Math.min(1, base * multiplier);
    } catch (error) {
      logger.error({ error, conflict }, 'Error scoring conflict');
      return conflict.intensity || 0;
    }
  }
}


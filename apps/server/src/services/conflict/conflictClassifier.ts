import { logger } from '../../logger';
import type { Conflict } from './types';

/**
 * Classifies and normalizes conflict data
 */
export class ConflictClassifier {
  private readonly validTypes = ['physical', 'verbal', 'social', 'emotional', 'internal', 'general'];

  /**
   * Classify and normalize conflict
   */
  classify(conflict: Conflict): Conflict {
    try {
      const type = this.validTypes.includes(conflict.type?.toLowerCase())
        ? conflict.type.toLowerCase()
        : 'general';

      // Calculate intensity if not provided or if beats exist
      let intensity = conflict.intensity || 0;

      if (conflict.conflictBeats && conflict.conflictBeats.length > 0) {
        const avgIntensity =
          conflict.conflictBeats.reduce((sum, beat) => sum + (beat.intensity || 0), 0) /
          conflict.conflictBeats.length;
        intensity = Math.min(1, avgIntensity);
      }

      return {
        ...conflict,
        type,
        intensity,
      };
    } catch (error) {
      logger.error({ error, conflict }, 'Error classifying conflict');
      return conflict;
    }
  }
}


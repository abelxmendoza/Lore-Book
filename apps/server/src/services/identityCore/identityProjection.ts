import { logger } from '../../logger';
import type { IdentityDimension, IdentityProjection } from './identityTypes';

/**
 * Projects future identity based on current dimensions
 */
export class IdentityProjectionEngine {
  /**
   * Project identity trajectory
   */
  project(dimensions: IdentityDimension[]): IdentityProjection {
    try {
      if (dimensions.length === 0) {
        return {
          trajectory: [],
          predictedIdentity: 'Unknown',
        };
      }

      // Sort by score and get top dimensions
      const sorted = [...dimensions].sort((a, b) => b.score - a.score);
      const top = sorted[0];

      // Build trajectory from top dimensions
      const trajectory = sorted.slice(0, 5).map((d) => d.name);

      return {
        trajectory,
        predictedIdentity: top?.name || 'Unknown',
      };
    } catch (error) {
      logger.error({ error }, 'Error projecting identity');
      return {
        trajectory: [],
        predictedIdentity: 'Unknown',
      };
    }
  }
}


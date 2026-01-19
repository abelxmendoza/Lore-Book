import { logger } from '../../logger';

import type { SocialProjection } from './types';

/**
 * Scores how "psychologically real" the projection is
 */
export class ProjectionScore {
  /**
   * Score projection based on type and confidence
   */
  score(projection: SocialProjection): number {
    try {
      let score = projection.confidence || 0;

      // Influencers and public figures are more "real" in the mental model
      if (projection.projectionType === 'influencer') {
        score += 0.1;
      }

      if (projection.projectionType === 'public_figure') {
        score += 0.15;
      }

      // Archetypes are less "real" but still psychologically significant
      if (projection.projectionType === 'archetype') {
        score += 0.05;
      }

      // Anticipated connections are moderately real
      if (projection.projectionType === 'anticipated_connection') {
        score += 0.08;
      }

      // Hypothetical people are least "real"
      if (projection.projectionType === 'hypothetical_person') {
        score -= 0.05;
      }

      return Math.min(1, Math.max(0, score));
    } catch (error) {
      logger.error({ error, projection }, 'Error scoring projection');
      return projection.confidence || 0;
    }
  }
}


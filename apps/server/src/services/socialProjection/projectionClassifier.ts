import { logger } from '../../logger';

import type { SocialProjection } from './types';

/**
 * Classifies social projections to determine what "kind" of projected person it is
 */
export class ProjectionClassifier {
  /**
   * Classify projection based on evidence
   */
  classify(projection: SocialProjection): SocialProjection {
    try {
      const evidence = projection.evidence.toLowerCase();

      // Check for crush-related projections
      if (evidence.match(/crush|girl I like|person I'm interested in|someone I like/)) {
        projection.projectionType = 'anticipated_connection';
        projection.confidence = Math.max(projection.confidence, 0.8);
      }

      // Check for unknown people
      if (evidence.match(/I don't know them yet|never met|haven't met|don't know who/)) {
        projection.projectionType = 'hypothetical_person';
        projection.confidence = Math.max(projection.confidence, 0.6);
      }

      // Check for celebrity/influencer mentions
      if (evidence.match(/celebrity|rapper|famous|well-known|popular|viral/)) {
        if (projection.projectionType !== 'influencer' && projection.projectionType !== 'public_figure') {
          projection.projectionType = 'influencer';
        }
        projection.confidence = Math.max(projection.confidence, 0.7);
      }

      // Check for archetype patterns
      if (evidence.match(/the rival|the mentor|the hater|the supporter|the leader|the enemy/)) {
        projection.projectionType = 'archetype';
        projection.confidence = Math.max(projection.confidence, 0.75);
      }

      // Check for future/imagined connections
      if (evidence.match(/future|will meet|might meet|could be|potential/)) {
        if (projection.projectionType === 'hypothetical_person') {
          projection.projectionType = 'anticipated_connection';
        }
        projection.confidence = Math.max(projection.confidence, 0.65);
      }

      return projection;
    } catch (error) {
      logger.error({ error, projection }, 'Error classifying projection');
      return projection;
    }
  }
}


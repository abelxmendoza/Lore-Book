import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { SocialProjection, ProjectionLink, LinkType } from './types';

/**
 * Links projections to real entities (crush_id, gym_id, future group, career arcs)
 */
export class ProjectionLinker {
  /**
   * Link projections to real entities
   */
  link(projections: SocialProjection[], ctx: any): ProjectionLink[] {
    const links: ProjectionLink[] = [];

    try {
      for (const projection of projections) {
        const evidence = projection.evidence.toLowerCase();

        // Link to crush if mentioned
        if (/her friend|her group|her circle|her people|her crew/.test(evidence)) {
          if (ctx.crushId) {
            links.push({
              id: randomUUID(),
              projectionId: projection.id!,
              relatedTo: ctx.crushId,
              linkType: 'friend_of',
              confidence: 0.9,
            });
          }
        }

        // Link to gym/group if mentioned
        if (/gym|training|team|group|crew|squad/.test(evidence)) {
          if (ctx.gymId || ctx.groupId) {
            links.push({
              id: randomUUID(),
              projectionId: projection.id!,
              relatedTo: ctx.gymId || ctx.groupId,
              linkType: 'associated_with',
              confidence: 0.7,
            });
          }
        }

        // Link influencer to influence relationship
        if (projection.projectionType === 'influencer') {
          links.push({
            id: randomUUID(),
            projectionId: projection.id!,
            relatedTo: null,
            linkType: 'influenced_by',
            confidence: 0.6,
          });
        }

        // Link archetype to matching real person
        if (projection.projectionType === 'archetype') {
          links.push({
            id: randomUUID(),
            projectionId: projection.id!,
            relatedTo: null,
            linkType: 'archetype_match',
            confidence: 0.5,
          });
        }
      }

      logger.debug({ count: links.length }, 'Created projection links');
    } catch (error) {
      logger.error({ error }, 'Error linking projections');
    }

    return links;
  }
}


import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { SocialProjection, ProjectionType } from './types';

/**
 * Extracts social projections from journal entries
 * Pulls mentions of people you don't know IRL
 */
export class ProjectionExtractor {
  private readonly patterns: Array<{ type: ProjectionType; regex: RegExp }> = [
    {
      type: 'anticipated_connection',
      regex: /(her friend|his boys|their group|crew|her circle|her people|his friends)/i,
    },
    {
      type: 'influencer',
      regex: /(influencer|youtuber|streamer|celebrity|rapper|artist|content creator|tiktoker)/i,
    },
    {
      type: 'public_figure',
      regex: /(politician|actor|athlete|founder|ceo|public figure|famous person)/i,
    },
    {
      type: 'archetype',
      regex: /(the rival|mentor|hater|supporter|leader|the enemy|the hero|the villain)/i,
    },
    {
      type: 'imagined_group',
      regex: /(imagined|hypothetical|future|potential|dream|fantasy)/i,
    },
  ];

  /**
   * Extract social projections from entries
   */
  extract(entries: any[]): SocialProjection[] {
    const projections: SocialProjection[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text;

        // Check each pattern
        for (const pattern of this.patterns) {
          if (pattern.regex.test(text)) {
            projections.push({
              id: randomUUID(),
              name: null,
              projectionType: pattern.type,
              evidence: text,
              timestamp: entry.timestamp,
              confidence: 0.7,
              source: 'thought',
            });
          }
        }

        // Fallback: unknown imaginary person
        if (/some girl|some dude|this guy|her new friend|someone I don't know|a person/i.test(text)) {
          projections.push({
            id: randomUUID(),
            name: null,
            projectionType: 'hypothetical_person',
            evidence: text,
            timestamp: entry.timestamp,
            confidence: 0.5,
            source: 'thought',
          });
        }
      }

      logger.debug({ count: projections.length }, 'Extracted social projections');
    } catch (error) {
      logger.error({ error }, 'Error extracting social projections');
    }

    return projections;
  }
}


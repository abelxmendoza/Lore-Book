import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { SocialProjection, ProjectionLink } from './types';

/**
 * Storage service for social projections and links
 */
export class ProjectionStorage {
  /**
   * Save social projections
   */
  async saveProjections(
    userId: string,
    projections: SocialProjection[]
  ): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const projection of projections) {
        const { data: row, error } = await supabase
          .from('social_projections')
          .insert({
            user_id: userId,
            memory_id: projection.memory_id || null,
            name: projection.name,
            projection_type: projection.projectionType,
            evidence: projection.evidence,
            timestamp: projection.timestamp,
            confidence: projection.confidence,
            source: projection.source,
            tags: projection.tags || [],
            score: projection.score,
            embedding: projection.embedding || null,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, projection }, 'Error inserting projection');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved social projections');
    } catch (error) {
      logger.error({ error }, 'Error saving projections');
    }

    return saved;
  }

  /**
   * Save projection links
   */
  async saveLinks(userId: string, links: ProjectionLink[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const link of links) {
        const { data: row, error } = await supabase
          .from('projection_links')
          .insert({
            user_id: userId,
            projection_id: link.projectionId,
            related_to: link.relatedTo,
            link_type: link.linkType,
            confidence: link.confidence,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, link }, 'Error inserting projection link');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved projection links');
    } catch (error) {
      logger.error({ error }, 'Error saving links');
    }

    return saved;
  }

  /**
   * Get projections for a user
   */
  async getProjections(userId: string, limit: number = 100): Promise<SocialProjection[]> {
    try {
      const { data, error } = await supabase
        .from('social_projections')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching projections');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        projectionType: row.projection_type,
        evidence: row.evidence,
        timestamp: row.timestamp,
        confidence: row.confidence,
        source: row.source,
        tags: row.tags || [],
        score: row.score,
        embedding: row.embedding || [],
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting projections');
      return [];
    }
  }

  /**
   * Get links for a user
   */
  async getLinks(userId: string): Promise<ProjectionLink[]> {
    try {
      const { data, error } = await supabase
        .from('projection_links')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching links');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        projectionId: row.projection_id,
        relatedTo: row.related_to,
        linkType: row.link_type,
        confidence: row.confidence,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting links');
      return [];
    }
  }
}


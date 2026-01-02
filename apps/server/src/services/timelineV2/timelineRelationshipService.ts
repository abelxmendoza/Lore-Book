import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type RelationshipType = 'spawned' | 'influenced' | 'overlapped' | 'preceded' | 'merged' | 'split';

export interface TimelineRelationship {
  id: string;
  user_id: string;
  source_timeline_id: string;
  target_timeline_id: string;
  relationship_type: RelationshipType;
  description?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateRelationshipPayload {
  source_timeline_id: string;
  target_timeline_id: string;
  relationship_type: RelationshipType;
  description?: string;
  metadata?: Record<string, unknown>;
}

export class TimelineRelationshipService {
  /**
   * Create a relationship between timelines
   */
  async createRelationship(
    userId: string,
    payload: CreateRelationshipPayload
  ): Promise<TimelineRelationship> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timeline_relationships')
        .insert({
          user_id: userId,
          source_timeline_id: payload.source_timeline_id,
          target_timeline_id: payload.target_timeline_id,
          relationship_type: payload.relationship_type,
          description: payload.description || null,
          metadata: payload.metadata || {}
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, payload }, 'Failed to create relationship');
        throw error;
      }

      return this.mapRelationshipFromDb(data);
    } catch (error) {
      logger.error({ error, userId }, 'Error in createRelationship');
      throw error;
    }
  }

  /**
   * Get related timelines for a timeline
   */
  async getRelatedTimelines(userId: string, timelineId: string): Promise<TimelineRelationship[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timeline_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(`source_timeline_id.eq.${timelineId},target_timeline_id.eq.${timelineId}`)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, userId, timelineId }, 'Failed to get related timelines');
        throw error;
      }

      return (data || []).map(row => this.mapRelationshipFromDb(row));
    } catch (error) {
      logger.error({ error, userId }, 'Error in getRelatedTimelines');
      throw error;
    }
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(userId: string, relationshipId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('timeline_relationships')
        .delete()
        .eq('user_id', userId)
        .eq('id', relationshipId);

      if (error) {
        logger.error({ error, userId, relationshipId }, 'Failed to delete relationship');
        throw error;
      }
    } catch (error) {
      logger.error({ error, userId }, 'Error in deleteRelationship');
      throw error;
    }
  }

  /**
   * Map database row to TimelineRelationship interface
   */
  private mapRelationshipFromDb(row: any): TimelineRelationship {
    return {
      id: row.id,
      user_id: row.user_id,
      source_timeline_id: row.source_timeline_id,
      target_timeline_id: row.target_timeline_id,
      relationship_type: row.relationship_type,
      description: row.description,
      metadata: row.metadata || {},
      created_at: row.created_at
    };
  }
}

export const timelineRelationshipService = new TimelineRelationshipService();

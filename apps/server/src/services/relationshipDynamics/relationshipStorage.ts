import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  RelationshipDynamics,
  RelationshipStats,
  RelationshipHealth,
  RelationshipStage,
} from './types';

/**
 * Handles storage and retrieval of relationship dynamics
 */
export class RelationshipStorage {
  /**
   * Save or update relationship dynamics
   */
  async saveRelationshipDynamics(
    dynamics: RelationshipDynamics
  ): Promise<RelationshipDynamics | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .upsert(
          {
            user_id: dynamics.user_id,
            person_name: dynamics.person_name,
            metrics: dynamics.metrics,
            health: dynamics.health,
            lifecycle: dynamics.lifecycle,
            interactions: dynamics.interactions,
            first_mentioned: dynamics.first_mentioned,
            last_mentioned: dynamics.last_mentioned,
            total_interactions: dynamics.total_interactions,
            common_topics: dynamics.common_topics,
            relationship_type: dynamics.relationship_type,
            metadata: dynamics.metadata,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,person_name',
          }
        )
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save relationship dynamics');
        return null;
      }

      logger.debug({ personName: dynamics.person_name }, 'Saved relationship dynamics');
      return data as RelationshipDynamics;
    } catch (error) {
      logger.error({ error }, 'Failed to save relationship dynamics');
      return null;
    }
  }

  /**
   * Get relationship dynamics for a person
   */
  async getRelationshipDynamics(
    userId: string,
    personName: string
  ): Promise<RelationshipDynamics | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .select('*')
        .eq('user_id', userId)
        .eq('person_name', personName)
        .single();

      if (error || !data) {
        return null;
      }

      return data as RelationshipDynamics;
    } catch (error) {
      logger.error({ error, personName }, 'Failed to get relationship dynamics');
      return null;
    }
  }

  /**
   * Get all relationships for user
   */
  async getAllRelationships(userId: string): Promise<RelationshipDynamics[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .select('*')
        .eq('user_id', userId)
        .order('last_mentioned', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get all relationships');
        return [];
      }

      return (data || []) as RelationshipDynamics[];
    } catch (error) {
      logger.error({ error }, 'Failed to get all relationships');
      return [];
    }
  }

  /**
   * Get relationships by health
   */
  async getRelationshipsByHealth(
    userId: string,
    health: RelationshipHealth
  ): Promise<RelationshipDynamics[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .select('*')
        .eq('user_id', userId)
        .eq("health->>'overall_health'", health)
        .order('last_mentioned', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get relationships by health');
        return [];
      }

      return (data || []) as RelationshipDynamics[];
    } catch (error) {
      logger.error({ error }, 'Failed to get relationships by health');
      return [];
    }
  }

  /**
   * Get relationships by stage
   */
  async getRelationshipsByStage(
    userId: string,
    stage: RelationshipStage
  ): Promise<RelationshipDynamics[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .select('*')
        .eq('user_id', userId)
        .eq("lifecycle->>'current_stage'", stage)
        .order('last_mentioned', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get relationships by stage');
        return [];
      }

      return (data || []) as RelationshipDynamics[];
    } catch (error) {
      logger.error({ error }, 'Failed to get relationships by stage');
      return [];
    }
  }

  /**
   * Get relationship statistics
   */
  async getStats(userId: string): Promise<RelationshipStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('relationship_dynamics')
        .select('health, lifecycle, total_interactions, person_name')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_relationships: 0,
          by_stage: {} as Record<RelationshipStage, number>,
          by_health: {} as Record<RelationshipHealth, number>,
          average_health_score: 0,
          relationships_improving: 0,
          relationships_declining: 0,
          most_active_relationships: [],
          relationships_needing_attention: [],
        };
      }

      const stats: RelationshipStats = {
        total_relationships: data.length,
        by_stage: {} as Record<RelationshipStage, number>,
        by_health: {} as Record<RelationshipHealth, number>,
        average_health_score: 0,
        relationships_improving: 0,
        relationships_declining: 0,
        most_active_relationships: [],
        relationships_needing_attention: [],
      };

      let totalHealthScore = 0;
      let healthScoreCount = 0;

      data.forEach(rel => {
        const health = rel.health as any;
        const lifecycle = rel.lifecycle as any;

        // Count by health
        if (health?.overall_health) {
          stats.by_health[health.overall_health as RelationshipHealth] =
            (stats.by_health[health.overall_health as RelationshipHealth] || 0) + 1;
        }

        // Count by stage
        if (lifecycle?.current_stage) {
          stats.by_stage[lifecycle.current_stage as RelationshipStage] =
            (stats.by_stage[lifecycle.current_stage as RelationshipStage] || 0) + 1;
        }

        // Track health scores
        if (health?.health_score) {
          totalHealthScore += health.health_score;
          healthScoreCount++;
        }

        // Track trends
        if (health?.trends?.health_trend === 'improving') {
          stats.relationships_improving++;
        }
        if (health?.trends?.health_trend === 'declining') {
          stats.relationships_declining++;
        }

        // Identify relationships needing attention
        if (
          health?.overall_health === 'poor' ||
          health?.overall_health === 'critical' ||
          lifecycle?.current_stage === 'declining'
        ) {
          stats.relationships_needing_attention.push(rel.person_name);
        }
      });

      // Calculate average health score
      if (healthScoreCount > 0) {
        stats.average_health_score = totalHealthScore / healthScoreCount;
      }

      // Get most active relationships
      stats.most_active_relationships = data
        .sort((a, b) => (b.total_interactions || 0) - (a.total_interactions || 0))
        .slice(0, 5)
        .map(rel => ({
          person_name: rel.person_name,
          interaction_count: rel.total_interactions || 0,
        }));

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get relationship stats');
      return {
        total_relationships: 0,
        by_stage: {} as Record<RelationshipStage, number>,
        by_health: {} as Record<RelationshipHealth, number>,
        average_health_score: 0,
        relationships_improving: 0,
        relationships_declining: 0,
        most_active_relationships: [],
        relationships_needing_attention: [],
      };
    }
  }
}


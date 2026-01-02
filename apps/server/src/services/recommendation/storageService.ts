import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  Recommendation,
  RecommendationStatus,
  RecommendationType,
} from './types';

/**
 * Storage service for recommendations
 */
export class RecommendationStorageService {
  /**
   * Save recommendations to database
   */
  async saveRecommendations(recommendations: Recommendation[]): Promise<void> {
    if (recommendations.length === 0) return;

    try {
      // Batch insert
      const batchSize = 100;
      for (let i = 0; i < recommendations.length; i += batchSize) {
        const batch = recommendations.slice(i, i + batchSize);

        const { error } = await supabaseAdmin.from('recommendations').insert(
          batch.map(rec => ({
            id: rec.id,
            user_id: rec.user_id,
            type: rec.type,
            title: rec.title,
            description: rec.description,
            context: rec.context,
            priority: rec.priority,
            confidence: rec.confidence,
            source_engine: rec.source_engine,
            source_data: rec.source_data || {},
            status: rec.status,
            expires_at: rec.expires_at,
          }))
        );

        if (error) {
          logger.error({ error, batchSize: batch.length }, 'Failed to save recommendations');
        }
      }

      logger.debug({ count: recommendations.length }, 'Saved recommendations');
    } catch (error) {
      logger.error({ error }, 'Failed to save recommendations');
    }
  }

  /**
   * Get active recommendations for a user
   */
  async getActiveRecommendations(
    userId: string,
    limit: number = 20
  ): Promise<Recommendation[]> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('recommendations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch active recommendations');
        return [];
      }

      return (data || []).map(this.mapDbToRecommendation);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch active recommendations');
      return [];
    }
  }

  /**
   * Update recommendation status
   */
  async updateStatus(
    recommendationId: string,
    status: RecommendationStatus
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'acted_upon') {
        updateData.action_taken_at = new Date().toISOString();
      }

      const { error } = await supabaseAdmin
        .from('recommendations')
        .update(updateData)
        .eq('id', recommendationId);

      if (error) {
        logger.error({ error, recommendationId, status }, 'Failed to update recommendation status');
      }
    } catch (error) {
      logger.error({ error, recommendationId, status }, 'Failed to update recommendation status');
    }
  }

  /**
   * Mark expired recommendations
   */
  async markAsExpired(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await supabaseAdmin
        .from('recommendations')
        .update({ status: 'dismissed', updated_at: now })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lt('expires_at', now);

      if (error) {
        logger.error({ error, userId }, 'Failed to mark expired recommendations');
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to mark expired recommendations');
    }
  }

  /**
   * Get recommendation history
   */
  async getRecommendationHistory(
    userId: string,
    limit: number = 50
  ): Promise<Recommendation[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('recommendations')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['shown', 'dismissed', 'acted_upon'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch recommendation history');
        return [];
      }

      return (data || []).map(this.mapDbToRecommendation);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch recommendation history');
      return [];
    }
  }

  /**
   * Get recommendation statistics
   */
  async getStats(userId: string): Promise<{
    total: number;
    pending: number;
    shown: number;
    dismissed: number;
    acted_upon: number;
    by_type: Record<RecommendationType, number>;
    action_rate: number;
    avg_confidence: number;
  }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('recommendations')
        .select('status, type, confidence')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total: 0,
          pending: 0,
          shown: 0,
          dismissed: 0,
          acted_upon: 0,
          by_type: {
            journal_prompt: 0,
            reflection_question: 0,
            action: 0,
            relationship_checkin: 0,
            goal_reminder: 0,
            pattern_exploration: 0,
            gap_filler: 0,
            continuity_followup: 0,
            growth_opportunity: 0,
            legacy_building: 0,
          },
          action_rate: 0,
          avg_confidence: 0,
        };
      }

      const stats = {
        total: data.length,
        pending: 0,
        shown: 0,
        dismissed: 0,
        acted_upon: 0,
        by_type: {
          journal_prompt: 0,
          reflection_question: 0,
          action: 0,
          relationship_checkin: 0,
          goal_reminder: 0,
          pattern_exploration: 0,
          gap_filler: 0,
          continuity_followup: 0,
          growth_opportunity: 0,
          legacy_building: 0,
        } as Record<RecommendationType, number>,
        action_rate: 0,
        avg_confidence: 0,
      };

      let confidenceSum = 0;
      let confidenceCount = 0;

      data.forEach(rec => {
        stats[rec.status as keyof typeof stats]++;
        stats.by_type[rec.type as RecommendationType]++;
        if (rec.confidence !== null) {
          confidenceSum += rec.confidence;
          confidenceCount++;
        }
      });

      stats.avg_confidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
      stats.action_rate =
        stats.shown > 0 ? stats.acted_upon / stats.shown : 0;

      return stats;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get recommendation stats');
      return {
        total: 0,
        pending: 0,
        shown: 0,
        dismissed: 0,
        acted_upon: 0,
        by_type: {
          journal_prompt: 0,
          reflection_question: 0,
          action: 0,
          relationship_checkin: 0,
          goal_reminder: 0,
          pattern_exploration: 0,
          gap_filler: 0,
          continuity_followup: 0,
          growth_opportunity: 0,
          legacy_building: 0,
        },
        action_rate: 0,
        avg_confidence: 0,
      };
    }
  }

  /**
   * Map database record to Recommendation type
   */
  private mapDbToRecommendation(record: any): Recommendation {
    return {
      id: record.id,
      user_id: record.user_id,
      type: record.type,
      title: record.title,
      description: record.description,
      context: record.context || {},
      priority: record.priority,
      confidence: record.confidence,
      source_engine: record.source_engine,
      source_data: record.source_data || {},
      status: record.status,
      action_taken_at: record.action_taken_at,
      expires_at: record.expires_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}

export const recommendationStorageService = new RecommendationStorageService();


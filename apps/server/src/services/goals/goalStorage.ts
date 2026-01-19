import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  Goal,
  GoalInsight,
  GoalStats,
  GoalStatus,
} from './types';

/**
 * Handles storage and retrieval of goals
 */
export class GoalStorage {
  /**
   * Save goals
   */
  async saveGoals(goals: Goal[]): Promise<Goal[]> {
    if (goals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('goals')
        .upsert(
          goals.map(g => ({
            id: g.id,
            user_id: g.user_id,
            title: g.title,
            description: g.description,
            created_at: g.created_at,
            updated_at: g.updated_at,
            last_action_at: g.last_action_at,
            status: g.status || 'active',
            milestones: g.milestones || [],
            probability: g.probability,
            dependencies: g.dependencies || [],
            source: g.source,
            source_id: g.source_id,
            metadata: g.metadata || {},
          })),
          {
            onConflict: 'id',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save goals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved goals');
      return (data || []) as Goal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save goals');
      return [];
    }
  }

  /**
   * Save goal insights
   */
  async saveInsights(insights: GoalInsight[]): Promise<GoalInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('goal_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            confidence: i.confidence,
            timestamp: i.timestamp,
            related_goal_id: i.related_goal_id,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save goal insights');
        return [];
      }

      return (data || []) as GoalInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save goal insights');
      return [];
    }
  }

  /**
   * Get goals for user
   */
  async getGoals(
    userId: string,
    status?: GoalStatus
  ): Promise<Goal[]> {
    try {
      let query = supabaseAdmin
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get goals');
        return [];
      }

      return (data || []) as Goal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get goals');
      return [];
    }
  }

  /**
   * Get goal insights
   */
  async getInsights(
    userId: string,
    goalId?: string
  ): Promise<GoalInsight[]> {
    try {
      let query = supabaseAdmin
        .from('goal_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (goalId) {
        query = query.eq('related_goal_id', goalId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get goal insights');
        return [];
      }

      return (data || []) as GoalInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get goal insights');
      return [];
    }
  }

  /**
   * Get goal statistics
   */
  async getStats(userId: string): Promise<GoalStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('goals')
        .select('status, probability, milestones, dependencies')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_goals: 0,
          by_status: {} as Record<GoalStatus, number>,
          active_goals: 0,
          completed_goals: 0,
          abandoned_goals: 0,
          average_probability: 0,
          goals_with_milestones: 0,
          goals_with_dependencies: 0,
        };
      }

      const stats: GoalStats = {
        total_goals: data.length,
        by_status: {} as Record<GoalStatus, number>,
        active_goals: 0,
        completed_goals: 0,
        abandoned_goals: 0,
        average_probability: 0,
        goals_with_milestones: 0,
        goals_with_dependencies: 0,
      };

      let totalProbability = 0;
      let probabilityCount = 0;

      data.forEach(goal => {
        // Count by status
        const status = goal.status as GoalStatus;
        stats.by_status[status] = (stats.by_status[status] || 0) + 1;

        if (status === 'active') stats.active_goals++;
        if (status === 'completed') stats.completed_goals++;
        if (status === 'abandoned') stats.abandoned_goals++;

        // Track probability
        if (goal.probability !== null && goal.probability !== undefined) {
          totalProbability += goal.probability;
          probabilityCount++;
        }

        // Track milestones
        if (goal.milestones && Array.isArray(goal.milestones) && goal.milestones.length > 0) {
          stats.goals_with_milestones++;
        }

        // Track dependencies
        if (goal.dependencies && Array.isArray(goal.dependencies) && goal.dependencies.length > 0) {
          stats.goals_with_dependencies++;
        }
      });

      if (probabilityCount > 0) {
        stats.average_probability = totalProbability / probabilityCount;
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get goal stats');
      return {
        total_goals: 0,
        by_status: {} as Record<GoalStatus, number>,
        active_goals: 0,
        completed_goals: 0,
        abandoned_goals: 0,
        average_probability: 0,
        goals_with_milestones: 0,
        goals_with_dependencies: 0,
      };
    }
  }
}


import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  Decision,
  DecisionInsight,
  DecisionStats,
} from './types';

/**
 * Handles storage and retrieval of decisions
 */
export class DecisionStorage {
  /**
   * Save decisions
   */
  async saveDecisions(decisions: Decision[]): Promise<Decision[]> {
    if (decisions.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('decisions')
        .upsert(
          decisions.map(d => ({
            id: d.id,
            user_id: d.user_id,
            description: d.description,
            timestamp: d.timestamp,
            category: d.category,
            outcome: d.outcome,
            risk_level: d.risk_level,
            similarity_matches: d.similarity_matches,
            predicted_consequences: d.predicted_consequences,
            context: d.context,
            alternatives_considered: d.alternatives_considered,
            metadata: d.metadata || {},
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: 'id',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save decisions');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved decisions');
      return (data || []) as Decision[];
    } catch (error) {
      logger.error({ error }, 'Failed to save decisions');
      return [];
    }
  }

  /**
   * Save decision insights
   */
  async saveInsights(insights: DecisionInsight[]): Promise<DecisionInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('decision_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            confidence: i.confidence,
            timestamp: i.timestamp,
            decision_id: i.decision_id,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save decision insights');
        return [];
      }

      return (data || []) as DecisionInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save decision insights');
      return [];
    }
  }

  /**
   * Get decisions for user
   */
  async getDecisions(userId: string, category?: string, outcome?: string): Promise<Decision[]> {
    try {
      let query = supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      if (outcome) {
        query = query.eq('outcome', outcome);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get decisions');
        return [];
      }

      return (data || []) as Decision[];
    } catch (error) {
      logger.error({ error }, 'Failed to get decisions');
      return [];
    }
  }

  /**
   * Get decision insights
   */
  async getInsights(userId: string, decisionId?: string): Promise<DecisionInsight[]> {
    try {
      let query = supabaseAdmin
        .from('decision_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (decisionId) {
        query = query.eq('decision_id', decisionId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get decision insights');
        return [];
      }

      return (data || []) as DecisionInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get decision insights');
      return [];
    }
  }

  /**
   * Get decision statistics
   */
  async getStats(userId: string): Promise<DecisionStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('decisions')
        .select('outcome, category, risk_level')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_decisions: 0,
          decisions_by_outcome: {},
          decisions_by_category: {},
          average_risk_level: 0,
          high_risk_decisions: 0,
          recurring_patterns: 0,
        };
      }

      const stats: DecisionStats = {
        total_decisions: data.length,
        decisions_by_outcome: {},
        decisions_by_category: {},
        average_risk_level: 0,
        high_risk_decisions: 0,
        recurring_patterns: 0,
      };

      let totalRisk = 0;
      let riskCount = 0;

      data.forEach(decision => {
        // Count by outcome
        const outcome = decision.outcome || 'unknown';
        stats.decisions_by_outcome[outcome] = (stats.decisions_by_outcome[outcome] || 0) + 1;

        // Count by category
        const category = decision.category || 'other';
        stats.decisions_by_category[category] = (stats.decisions_by_category[category] || 0) + 1;

        // Track risk
        if (decision.risk_level !== null && decision.risk_level !== undefined) {
          totalRisk += decision.risk_level;
          riskCount++;
          if (decision.risk_level >= 0.7) {
            stats.high_risk_decisions++;
          }
        }
      });

      if (riskCount > 0) {
        stats.average_risk_level = totalRisk / riskCount;
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get decision stats');
      return {
        total_decisions: 0,
        decisions_by_outcome: {},
        decisions_by_category: {},
        average_risk_level: 0,
        high_risk_decisions: 0,
        recurring_patterns: 0,
      };
    }
  }
}


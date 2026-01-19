import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  ValueSignal,
  BeliefSignal,
  ValueInsight,
  ValueCategory,
  ValuesStats,
} from './types';

/**
 * Handles storage and retrieval of values and beliefs data
 */
export class ValuesStorage {
  /**
   * Save value signals
   */
  async saveValueSignals(signals: ValueSignal[]): Promise<ValueSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('value_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            category: s.category,
            strength: s.strength,
            text: s.text,
            entry_id: s.entry_id,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save value signals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved value signals');
      return (data || []) as ValueSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save value signals');
      return [];
    }
  }

  /**
   * Save belief signals
   */
  async saveBeliefSignals(signals: BeliefSignal[]): Promise<BeliefSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('belief_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            statement: s.statement,
            polarity: s.polarity,
            confidence: s.confidence,
            entry_id: s.entry_id,
            is_explicit: s.is_explicit,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save belief signals');
        return [];
      }

      return (data || []) as BeliefSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save belief signals');
      return [];
    }
  }

  /**
   * Save value insights
   */
  async saveInsights(insights: ValueInsight[]): Promise<ValueInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('value_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            category: i.category,
            timestamp: i.timestamp,
            confidence: i.confidence,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save value insights');
        return [];
      }

      return (data || []) as ValueInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save value insights');
      return [];
    }
  }

  /**
   * Get value signals
   */
  async getValueSignals(userId: string, category?: ValueCategory): Promise<ValueSignal[]> {
    try {
      let query = supabaseAdmin
        .from('value_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get value signals');
        return [];
      }

      return (data || []) as ValueSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get value signals');
      return [];
    }
  }

  /**
   * Get belief signals
   */
  async getBeliefSignals(userId: string, explicitOnly?: boolean): Promise<BeliefSignal[]> {
    try {
      let query = supabaseAdmin
        .from('belief_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (explicitOnly !== undefined) {
        query = query.eq('is_explicit', explicitOnly);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get belief signals');
        return [];
      }

      return (data || []) as BeliefSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get belief signals');
      return [];
    }
  }

  /**
   * Get value insights
   */
  async getInsights(userId: string, type?: string, category?: ValueCategory): Promise<ValueInsight[]> {
    try {
      let query = supabaseAdmin
        .from('value_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get value insights');
        return [];
      }

      return (data || []) as ValueInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get value insights');
      return [];
    }
  }

  /**
   * Get values statistics
   */
  async getStats(userId: string): Promise<ValuesStats> {
    try {
      const { data: valueSignals, error: valueError } = await supabaseAdmin
        .from('value_signals')
        .select('category, strength')
        .eq('user_id', userId);

      const { data: beliefSignals, error: beliefError } = await supabaseAdmin
        .from('belief_signals')
        .select('id')
        .eq('user_id', userId);

      const { data: insights, error: insightsError } = await supabaseAdmin
        .from('value_insights')
        .select('type')
        .eq('user_id', userId);

      if (valueError || beliefError || insightsError) {
        return this.getEmptyStats();
      }

      // Calculate top values
      const categoryScores: Record<string, number> = {};
      (valueSignals || []).forEach(s => {
        if (!categoryScores[s.category]) {
          categoryScores[s.category] = 0;
        }
        categoryScores[s.category] += s.strength || 0;
      });

      const topValues = Object.entries(categoryScores)
        .map(([category, score]) => ({ category: category as ValueCategory, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const conflicts = (insights || []).filter(i => i.type === 'value_conflict').length;
      const misalignments = (insights || []).filter(i => i.type === 'misalignment').length;
      const coreValues = (insights || []).filter(i => i.type === 'core_value_detected').length;

      return {
        total_value_signals: valueSignals?.length || 0,
        total_belief_signals: beliefSignals?.length || 0,
        core_values_count: coreValues,
        conflicts_count: conflicts,
        misalignments_count: misalignments,
        top_values: topValues,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get values stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): ValuesStats {
    return {
      total_value_signals: 0,
      total_belief_signals: 0,
      core_values_count: 0,
      conflicts_count: 0,
      misalignments_count: 0,
      top_values: [],
    };
  }
}


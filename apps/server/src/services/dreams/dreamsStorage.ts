import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  DreamSignal,
  AspirationSignal,
  DreamInsight,
  DreamCategory,
  DreamsStats,
} from './types';

/**
 * Handles storage and retrieval of dreams and aspirations data
 */
export class DreamsStorage {
  /**
   * Save dream signals
   */
  async saveDreamSignals(signals: DreamSignal[]): Promise<DreamSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('dream_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            category: s.category,
            clarity: s.clarity,
            desire: s.desire,
            text: s.text,
            entry_id: s.entry_id,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save dream signals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved dream signals');
      return (data || []) as DreamSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save dream signals');
      return [];
    }
  }

  /**
   * Save aspiration signals
   */
  async saveAspirationSignals(signals: AspirationSignal[]): Promise<AspirationSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('aspiration_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            statement: s.statement,
            polarity: s.polarity,
            confidence: s.confidence,
            entry_id: s.entry_id,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save aspiration signals');
        return [];
      }

      return (data || []) as AspirationSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save aspiration signals');
      return [];
    }
  }

  /**
   * Save dream insights
   */
  async saveInsights(insights: DreamInsight[]): Promise<DreamInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('dream_insights')
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
        logger.error({ error }, 'Failed to save dream insights');
        return [];
      }

      return (data || []) as DreamInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save dream insights');
      return [];
    }
  }

  /**
   * Get dream signals
   */
  async getDreamSignals(userId: string, category?: DreamCategory): Promise<DreamSignal[]> {
    try {
      let query = supabaseAdmin
        .from('dream_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get dream signals');
        return [];
      }

      return (data || []) as DreamSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get dream signals');
      return [];
    }
  }

  /**
   * Get aspiration signals
   */
  async getAspirationSignals(userId: string): Promise<AspirationSignal[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('aspiration_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get aspiration signals');
        return [];
      }

      return (data || []) as AspirationSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get aspiration signals');
      return [];
    }
  }

  /**
   * Get dream insights
   */
  async getInsights(userId: string, type?: string, category?: DreamCategory): Promise<DreamInsight[]> {
    try {
      let query = supabaseAdmin
        .from('dream_insights')
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
        logger.error({ error }, 'Failed to get dream insights');
        return [];
      }

      return (data || []) as DreamInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get dream insights');
      return [];
    }
  }

  /**
   * Get dreams statistics
   */
  async getStats(userId: string): Promise<DreamsStats> {
    try {
      const { data: dreamSignals, error: dreamError } = await supabaseAdmin
        .from('dream_signals')
        .select('category, clarity, desire')
        .eq('user_id', userId);

      const { data: aspirationSignals, error: aspirationError } = await supabaseAdmin
        .from('aspiration_signals')
        .select('id')
        .eq('user_id', userId);

      const { data: insights, error: insightsError } = await supabaseAdmin
        .from('dream_insights')
        .select('type')
        .eq('user_id', userId);

      if (dreamError || aspirationError || insightsError) {
        return this.getEmptyStats();
      }

      // Calculate top dreams
      const categoryScores: Record<string, number> = {};
      (dreamSignals || []).forEach(s => {
        if (!categoryScores[s.category]) {
          categoryScores[s.category] = 0;
        }
        categoryScores[s.category] += (s.desire || 0) + (s.clarity || 0);
      });

      const topDreams = Object.entries(categoryScores)
        .map(([category, score]) => ({ category: category as DreamCategory, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const conflicts = (insights || []).filter(i => i.type === 'dream_conflict').length;
      const coreDreams = (insights || []).filter(i => i.type === 'core_dream_detected').length;

      const totalClarity = (dreamSignals || []).reduce((sum, s) => sum + (s.clarity || 0), 0);
      const totalDesire = (dreamSignals || []).reduce((sum, s) => sum + (s.desire || 0), 0);
      const dreamCount = dreamSignals?.length || 0;

      return {
        total_dream_signals: dreamCount,
        total_aspiration_signals: aspirationSignals?.length || 0,
        core_dreams_count: coreDreams,
        conflicts_count: conflicts,
        average_clarity: dreamCount > 0 ? totalClarity / dreamCount : 0,
        average_desire: dreamCount > 0 ? totalDesire / dreamCount : 0,
        top_dreams: topDreams,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get dreams stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): DreamsStats {
    return {
      total_dream_signals: 0,
      total_aspiration_signals: 0,
      core_dreams_count: 0,
      conflicts_count: 0,
      average_clarity: 0,
      average_desire: 0,
      top_dreams: [],
    };
  }
}


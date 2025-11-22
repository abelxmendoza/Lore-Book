import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  GrowthSignal,
  GrowthTrajectoryPoint,
  GrowthInsight,
  GrowthStats,
  GrowthDomain,
} from './types';

/**
 * Handles storage and retrieval of growth data
 */
export class GrowthStorage {
  /**
   * Save growth signals
   */
  async saveSignals(signals: GrowthSignal[]): Promise<GrowthSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('growth_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            domain: s.domain,
            intensity: s.intensity,
            direction: s.direction,
            text: s.text,
            entry_id: s.entry_id,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save growth signals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved growth signals');
      return (data || []) as GrowthSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save growth signals');
      return [];
    }
  }

  /**
   * Save growth trajectory points
   */
  async saveTrajectoryPoints(points: GrowthTrajectoryPoint[]): Promise<GrowthTrajectoryPoint[]> {
    if (points.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('growth_trajectory_points')
        .insert(
          points.map(p => ({
            user_id: p.user_id,
            timestamp: p.timestamp,
            domain: p.domain,
            value: p.value,
            metadata: p.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save growth trajectory points');
        return [];
      }

      return (data || []) as GrowthTrajectoryPoint[];
    } catch (error) {
      logger.error({ error }, 'Failed to save growth trajectory points');
      return [];
    }
  }

  /**
   * Save growth insights
   */
  async saveInsights(insights: GrowthInsight[]): Promise<GrowthInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('growth_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            domain: i.domain,
            timestamp: i.timestamp,
            confidence: i.confidence,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save growth insights');
        return [];
      }

      return (data || []) as GrowthInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save growth insights');
      return [];
    }
  }

  /**
   * Get growth signals
   */
  async getSignals(userId: string, domain?: GrowthDomain): Promise<GrowthSignal[]> {
    try {
      let query = supabaseAdmin
        .from('growth_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get growth signals');
        return [];
      }

      return (data || []) as GrowthSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get growth signals');
      return [];
    }
  }

  /**
   * Get growth insights
   */
  async getInsights(userId: string, type?: string, domain?: GrowthDomain): Promise<GrowthInsight[]> {
    try {
      let query = supabaseAdmin
        .from('growth_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get growth insights');
        return [];
      }

      return (data || []) as GrowthInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get growth insights');
      return [];
    }
  }

  /**
   * Get growth statistics
   */
  async getStats(userId: string): Promise<GrowthStats> {
    try {
      const { data: signals, error: signalsError } = await supabaseAdmin
        .from('growth_signals')
        .select('domain, direction')
        .eq('user_id', userId);

      const { data: insights, error: insightsError } = await supabaseAdmin
        .from('growth_insights')
        .select('type, domain')
        .eq('user_id', userId);

      if (signalsError || insightsError) {
        return this.getEmptyStats();
      }

      const stats: GrowthStats = {
        total_signals: signals?.length || 0,
        domains_active: 0,
        average_velocity: 0,
        total_breakthroughs: 0,
        total_plateaus: 0,
        fastest_growing_domain: null,
        most_stagnant_domain: null,
        overall_growth_score: 0,
      };

      // Count domains
      const domainSet = new Set(signals?.map(s => s.domain) || []);
      stats.domains_active = domainSet.size;

      // Count breakthroughs and plateaus
      insights?.forEach(i => {
        if (i.type === 'breakthrough') stats.total_breakthroughs++;
        if (i.type === 'plateau' || i.type === 'stagnation_zone') stats.total_plateaus++;
      });

      // TODO: Calculate average velocity and scores from domain results
      // This would require fetching domain results or calculating them

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get growth stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): GrowthStats {
    return {
      total_signals: 0,
      domains_active: 0,
      average_velocity: 0,
      total_breakthroughs: 0,
      total_plateaus: 0,
      fastest_growing_domain: null,
      most_stagnant_domain: null,
      overall_growth_score: 0,
    };
  }
}


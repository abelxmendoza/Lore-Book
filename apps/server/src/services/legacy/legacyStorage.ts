import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  LegacySignal,
  LegacyCluster,
  LegacyTrajectoryPoint,
  LegacyInsight,
  LegacyStats,
  LegacyDomain,
} from './types';

/**
 * Handles storage and retrieval of legacy data
 */
export class LegacyStorage {
  /**
   * Save legacy signals
   */
  async saveSignals(signals: LegacySignal[]): Promise<LegacySignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('legacy_signals')
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
        logger.error({ error }, 'Failed to save legacy signals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved legacy signals');
      return (data || []) as LegacySignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save legacy signals');
      return [];
    }
  }

  /**
   * Save legacy clusters
   */
  async saveClusters(clusters: LegacyCluster[]): Promise<LegacyCluster[]> {
    if (clusters.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('legacy_clusters')
        .upsert(
          clusters.map(c => ({
            id: c.id,
            user_id: c.user_id,
            theme: c.theme,
            keywords: c.keywords || [],
            significance: c.significance,
            domain: c.domain,
            metadata: c.metadata || {},
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: 'id',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save legacy clusters');
        return [];
      }

      return (data || []) as LegacyCluster[];
    } catch (error) {
      logger.error({ error }, 'Failed to save legacy clusters');
      return [];
    }
  }

  /**
   * Save legacy trajectory points
   */
  async saveTrajectoryPoints(points: LegacyTrajectoryPoint[]): Promise<LegacyTrajectoryPoint[]> {
    if (points.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('legacy_trajectory_points')
        .insert(
          points.map(p => ({
            user_id: p.user_id,
            timestamp: p.timestamp,
            domain: p.domain,
            significance: p.significance,
            metadata: p.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save legacy trajectory points');
        return [];
      }

      return (data || []) as LegacyTrajectoryPoint[];
    } catch (error) {
      logger.error({ error }, 'Failed to save legacy trajectory points');
      return [];
    }
  }

  /**
   * Save legacy insights
   */
  async saveInsights(insights: LegacyInsight[]): Promise<LegacyInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('legacy_insights')
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
        logger.error({ error }, 'Failed to save legacy insights');
        return [];
      }

      return (data || []) as LegacyInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save legacy insights');
      return [];
    }
  }

  /**
   * Get legacy signals
   */
  async getSignals(userId: string, domain?: LegacyDomain): Promise<LegacySignal[]> {
    try {
      let query = supabaseAdmin
        .from('legacy_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get legacy signals');
        return [];
      }

      return (data || []) as LegacySignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get legacy signals');
      return [];
    }
  }

  /**
   * Get legacy clusters
   */
  async getClusters(userId: string): Promise<LegacyCluster[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('legacy_clusters')
        .select('*')
        .eq('user_id', userId)
        .order('significance', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get legacy clusters');
        return [];
      }

      return (data || []) as LegacyCluster[];
    } catch (error) {
      logger.error({ error }, 'Failed to get legacy clusters');
      return [];
    }
  }

  /**
   * Get legacy insights
   */
  async getInsights(userId: string, type?: string, domain?: LegacyDomain): Promise<LegacyInsight[]> {
    try {
      let query = supabaseAdmin
        .from('legacy_insights')
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
        logger.error({ error }, 'Failed to get legacy insights');
        return [];
      }

      return (data || []) as LegacyInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get legacy insights');
      return [];
    }
  }

  /**
   * Get legacy statistics
   */
  async getStats(userId: string): Promise<LegacyStats> {
    try {
      const { data: signals, error: signalsError } = await supabaseAdmin
        .from('legacy_signals')
        .select('domain, intensity')
        .eq('user_id', userId);

      const { data: clusters, error: clustersError } = await supabaseAdmin
        .from('legacy_clusters')
        .select('id')
        .eq('user_id', userId);

      if (signalsError || clustersError) {
        return this.getEmptyStats();
      }

      const stats: LegacyStats = {
        total_signals: signals?.length || 0,
        domains_active: 0,
        average_significance: 0,
        strongest_domain: null,
        most_fragile_domain: null,
        total_clusters: clusters?.length || 0,
        overall_legacy_score: 0,
      };

      // Count domains
      const domainSet = new Set(signals?.map(s => s.domain) || []);
      stats.domains_active = domainSet.size;

      // Calculate average significance
      if (signals && signals.length > 0) {
        const totalIntensity = signals.reduce((sum, s) => sum + (s.intensity || 0), 0);
        stats.average_significance = totalIntensity / signals.length;
      }

      // TODO: Calculate strongest/most fragile domains and overall score
      // This would require fetching domain results or calculating them

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get legacy stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): LegacyStats {
    return {
      total_signals: 0,
      domains_active: 0,
      average_significance: 0,
      strongest_domain: null,
      most_fragile_domain: null,
      total_clusters: 0,
      overall_legacy_score: 0,
    };
  }
}


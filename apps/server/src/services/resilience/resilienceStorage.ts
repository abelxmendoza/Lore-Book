import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  Setback,
  RecoveryEvent,
  ResilienceInsight,
  ResilienceStats,
} from './types';

/**
 * Handles storage and retrieval of resilience data
 */
export class ResilienceStorage {
  /**
   * Save setbacks
   */
  async saveSetbacks(setbacks: Setback[]): Promise<Setback[]> {
    if (setbacks.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('setbacks')
        .upsert(
          setbacks.map(s => ({
            id: s.id,
            user_id: s.user_id,
            timestamp: s.timestamp,
            reason: s.reason,
            severity: s.severity,
            category: s.category,
            metadata: s.metadata || {},
          })),
          {
            onConflict: 'id',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save setbacks');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved setbacks');
      return (data || []) as Setback[];
    } catch (error) {
      logger.error({ error }, 'Failed to save setbacks');
      return [];
    }
  }

  /**
   * Save recovery events
   */
  async saveRecoveryEvents(events: RecoveryEvent[]): Promise<RecoveryEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('recovery_events')
        .upsert(
          events.map(e => ({
            setback_id: e.setback_id,
            recovery_start: e.recovery_start,
            recovery_end: e.recovery_end,
            emotional_trajectory: e.emotional_trajectory,
            behavioral_changes: e.behavioral_changes,
            recovery_duration_days: e.recovery_duration_days,
            metadata: e.metadata || {},
          })),
          {
            onConflict: 'setback_id',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save recovery events');
        return [];
      }

      return (data || []) as RecoveryEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save recovery events');
      return [];
    }
  }

  /**
   * Save resilience insights
   */
  async saveInsights(insights: ResilienceInsight[]): Promise<ResilienceInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('resilience_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            confidence: i.confidence,
            timestamp: i.timestamp,
            related_setback_id: i.related_setback_id,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save resilience insights');
        return [];
      }

      return (data || []) as ResilienceInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save resilience insights');
      return [];
    }
  }

  /**
   * Get setbacks for user
   */
  async getSetbacks(userId: string, severity?: string): Promise<Setback[]> {
    try {
      let query = supabaseAdmin
        .from('setbacks')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (severity) {
        query = query.eq('severity', severity);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get setbacks');
        return [];
      }

      return (data || []) as Setback[];
    } catch (error) {
      logger.error({ error }, 'Failed to get setbacks');
      return [];
    }
  }

  /**
   * Get recovery events
   */
  async getRecoveryEvents(userId: string, setbackId?: string): Promise<RecoveryEvent[]> {
    try {
      let query = supabaseAdmin
        .from('recovery_events')
        .select('*')
        .eq('user_id', userId)
        .order('recovery_start', { ascending: false });

      if (setbackId) {
        query = query.eq('setback_id', setbackId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get recovery events');
        return [];
      }

      return (data || []) as RecoveryEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get recovery events');
      return [];
    }
  }

  /**
   * Get resilience insights
   */
  async getInsights(userId: string, type?: string): Promise<ResilienceInsight[]> {
    try {
      let query = supabaseAdmin
        .from('resilience_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get resilience insights');
        return [];
      }

      return (data || []) as ResilienceInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get resilience insights');
      return [];
    }
  }

  /**
   * Get resilience statistics
   */
  async getStats(userId: string): Promise<ResilienceStats> {
    try {
      const { data: setbacks, error: setbacksError } = await supabaseAdmin
        .from('setbacks')
        .select('severity')
        .eq('user_id', userId);

      const { data: insights, error: insightsError } = await supabaseAdmin
        .from('resilience_insights')
        .select('type, related_setback_id')
        .eq('user_id', userId);

      const { data: recoveries, error: recoveriesError } = await supabaseAdmin
        .from('recovery_events')
        .select('recovery_duration_days')
        .eq('user_id', userId)
        .not('recovery_duration_days', 'is', null);

      if (setbacksError || insightsError || recoveriesError) {
        return this.getEmptyStats();
      }

      const stats: ResilienceStats = {
        total_setbacks: setbacks?.length || 0,
        setbacks_by_severity: {
          low: 0,
          medium: 0,
          high: 0,
        },
        total_recoveries: recoveries?.length || 0,
        average_recovery_days: 0,
        resilience_score: 0,
        growth_events: 0,
        emotional_recoveries: 0,
        behavioral_recoveries: 0,
      };

      // Count setbacks by severity
      setbacks?.forEach(s => {
        const severity = s.severity as 'low' | 'medium' | 'high';
        stats.setbacks_by_severity[severity]++;
      });

      // Count recovery types
      insights?.forEach(i => {
        if (i.type === 'emotional_recovery') stats.emotional_recoveries++;
        if (i.type === 'behavioral_recovery') stats.behavioral_recoveries++;
        if (i.type === 'growth_from_adversity') stats.growth_events++;
        if (i.type === 'resilience_score') {
          stats.resilience_score = (i.metadata as any)?.score || (i.metadata as any)?.percentage ? ((i.metadata as any).percentage / 100) : 0;
        }
      });

      // Calculate average recovery days
      if (recoveries && recoveries.length > 0) {
        const totalDays = recoveries.reduce((sum, r) => sum + (r.recovery_duration_days || 0), 0);
        stats.average_recovery_days = totalDays / recoveries.length;
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get resilience stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): ResilienceStats {
    return {
      total_setbacks: 0,
      setbacks_by_severity: {
        low: 0,
        medium: 0,
        high: 0,
      },
      total_recoveries: 0,
      average_recovery_days: 0,
      resilience_score: 0,
      growth_events: 0,
      emotional_recoveries: 0,
      behavioral_recoveries: 0,
    };
  }
}


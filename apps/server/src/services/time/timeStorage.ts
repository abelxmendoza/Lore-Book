import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  TimeEvent,
  TimeBlock,
  ProcrastinationSignal,
  EnergyCurvePoint,
  TimeScore,
  TimeInsight,
  TimeCategory,
  ProcrastinationType,
  TimeStats,
} from './types';

/**
 * Handles storage and retrieval of time management data
 */
export class TimeStorage {
  /**
   * Save time events
   */
  async saveTimeEvents(events: TimeEvent[]): Promise<TimeEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('time_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            duration_minutes: e.durationMinutes,
            category: e.category,
            description: e.description,
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save time events');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved time events');
      return (data || []) as TimeEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save time events');
      return [];
    }
  }

  /**
   * Save time blocks
   */
  async saveTimeBlocks(blocks: TimeBlock[]): Promise<TimeBlock[]> {
    if (blocks.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('time_blocks')
        .insert(
          blocks.map(b => ({
            user_id: b.user_id,
            start: b.start,
            end: b.end,
            duration_minutes: b.durationMinutes,
            category: b.category,
            metadata: b.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save time blocks');
        return [];
      }

      return (data || []) as TimeBlock[];
    } catch (error) {
      logger.error({ error }, 'Failed to save time blocks');
      return [];
    }
  }

  /**
   * Save procrastination signals
   */
  async saveProcrastinationSignals(signals: ProcrastinationSignal[]): Promise<ProcrastinationSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('procrastination_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            type: s.type,
            evidence: s.evidence,
            confidence: s.confidence,
            category: s.category,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save procrastination signals');
        return [];
      }

      return (data || []) as ProcrastinationSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save procrastination signals');
      return [];
    }
  }

  /**
   * Save energy curve points
   */
  async saveEnergyCurve(userId: string, curve: EnergyCurvePoint[]): Promise<EnergyCurvePoint[]> {
    if (curve.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('energy_curve_points')
        .insert(
          curve.map(p => ({
            user_id: userId,
            hour: p.hour,
            level: p.level,
            count: p.count || 0,
            metadata: {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save energy curve');
        return [];
      }

      return (data || []).map((p: any) => ({
        hour: p.hour,
        level: p.level,
        count: p.count,
      })) as EnergyCurvePoint[];
    } catch (error) {
      logger.error({ error }, 'Failed to save energy curve');
      return [];
    }
  }

  /**
   * Save time score
   */
  async saveTimeScore(userId: string, score: TimeScore): Promise<TimeScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('time_scores')
        .insert({
          user_id: userId,
          consistency: score.consistency,
          efficiency: score.efficiency,
          distribution: score.distribution,
          focus: score.focus,
          overall: score.overall,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save time score');
        return null;
      }

      return {
        consistency: data.consistency,
        efficiency: data.efficiency,
        distribution: data.distribution,
        focus: data.focus,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save time score');
      return null;
    }
  }

  /**
   * Save time insights
   */
  async saveInsights(insights: TimeInsight[]): Promise<TimeInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('time_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            timestamp: i.timestamp,
            confidence: i.confidence,
            category: i.category,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save time insights');
        return [];
      }

      return (data || []) as TimeInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save time insights');
      return [];
    }
  }

  /**
   * Get time events
   */
  async getTimeEvents(userId: string, category?: TimeCategory): Promise<TimeEvent[]> {
    try {
      let query = supabaseAdmin
        .from('time_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get time events');
        return [];
      }

      return (data || []).map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        timestamp: e.timestamp,
        durationMinutes: e.duration_minutes,
        category: e.category,
        description: e.description,
        entry_id: e.entry_id,
        metadata: e.metadata,
      })) as TimeEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get time events');
      return [];
    }
  }

  /**
   * Get time blocks
   */
  async getTimeBlocks(userId: string, category?: TimeCategory): Promise<TimeBlock[]> {
    try {
      let query = supabaseAdmin
        .from('time_blocks')
        .select('*')
        .eq('user_id', userId)
        .order('start', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get time blocks');
        return [];
      }

      return (data || []).map((b: any) => ({
        id: b.id,
        user_id: b.user_id,
        start: b.start,
        end: b.end,
        durationMinutes: b.duration_minutes,
        category: b.category,
        metadata: b.metadata,
      })) as TimeBlock[];
    } catch (error) {
      logger.error({ error }, 'Failed to get time blocks');
      return [];
    }
  }

  /**
   * Get procrastination signals
   */
  async getProcrastinationSignals(userId: string, type?: ProcrastinationType): Promise<ProcrastinationSignal[]> {
    try {
      let query = supabaseAdmin
        .from('procrastination_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get procrastination signals');
        return [];
      }

      return (data || []) as ProcrastinationSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get procrastination signals');
      return [];
    }
  }

  /**
   * Get latest energy curve
   */
  async getLatestEnergyCurve(userId: string): Promise<EnergyCurvePoint[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('energy_curve_points')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(24);

      if (error) {
        logger.error({ error }, 'Failed to get energy curve');
        return [];
      }

      return (data || []).map((p: any) => ({
        hour: p.hour,
        level: p.level,
        count: p.count,
      })) as EnergyCurvePoint[];
    } catch (error) {
      logger.error({ error }, 'Failed to get energy curve');
      return [];
    }
  }

  /**
   * Get latest time score
   */
  async getLatestTimeScore(userId: string): Promise<TimeScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('time_scores')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        consistency: data.consistency,
        efficiency: data.efficiency,
        distribution: data.distribution,
        focus: data.focus,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get time score');
      return null;
    }
  }

  /**
   * Get time statistics
   */
  async getStats(userId: string): Promise<TimeStats> {
    try {
      const { data: events, error: eventError } = await supabaseAdmin
        .from('time_events')
        .select('category, duration_minutes')
        .eq('user_id', userId);

      const { data: blocks, error: blockError } = await supabaseAdmin
        .from('time_blocks')
        .select('duration_minutes')
        .eq('user_id', userId);

      const { data: procrastination, error: procrastinationError } = await supabaseAdmin
        .from('procrastination_signals')
        .select('type')
        .eq('user_id', userId);

      const { data: energy, error: energyError } = await supabaseAdmin
        .from('energy_curve_points')
        .select('level')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(24);

      const { data: score, error: scoreError } = await supabaseAdmin
        .from('time_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (eventError || blockError || procrastinationError || energyError || scoreError) {
        return this.getEmptyStats();
      }

      // Calculate event distribution
      const eventsByCategory: Record<string, number> = {};
      (events || []).forEach(e => {
        eventsByCategory[e.category] = (eventsByCategory[e.category] || 0) + 1;
      });

      // Calculate total time
      const totalTime = (blocks || []).reduce((sum, b) => sum + (b.duration_minutes || 0), 0);

      // Calculate procrastination distribution
      const procrastinationByType: Record<string, number> = {};
      (procrastination || []).forEach(p => {
        procrastinationByType[p.type] = (procrastinationByType[p.type] || 0) + 1;
      });

      // Calculate average energy
      const totalEnergy = (energy || []).reduce((sum, e) => sum + (e.level || 0), 0);
      const avgEnergy = (energy || []).length > 0 ? totalEnergy / energy.length : 0;

      // Find peak energy hour
      const energyByHour = (energy || []).reduce((acc, e) => {
        acc[e.hour] = e.level;
        return acc;
      }, {} as Record<number, number>);
      const peakHour = Object.entries(energyByHour)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

      // Top categories
      const topCategories = Object.entries(eventsByCategory)
        .map(([category, count]) => ({ category: category as TimeCategory, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total_events: events?.length || 0,
        events_by_category: eventsByCategory as Record<TimeCategory, number>,
        total_blocks: blocks?.length || 0,
        total_procrastination: procrastination?.length || 0,
        procrastination_by_type: procrastinationByType as Record<ProcrastinationType, number>,
        average_energy_level: avgEnergy,
        peak_energy_hour: peakHour,
        time_score: score?.overall || 0,
        top_categories: topCategories,
        total_time_minutes: totalTime,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get time stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): TimeStats {
    return {
      total_events: 0,
      events_by_category: {} as Record<TimeCategory, number>,
      total_blocks: 0,
      total_procrastination: 0,
      procrastination_by_type: {} as Record<ProcrastinationType, number>,
      average_energy_level: 0,
      peak_energy_hour: 0,
      time_score: 0,
      top_categories: [],
      total_time_minutes: 0,
    };
  }
}


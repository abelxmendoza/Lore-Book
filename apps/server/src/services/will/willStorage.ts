import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { WillEvent, AgencyMetrics } from './types';

/**
 * Handles storage and retrieval of will events
 */
export class WillStorage {
  /**
   * Save will event
   */
  async saveWillEvent(userId: string, willEvent: Omit<WillEvent, 'id' | 'created_at'>): Promise<WillEvent> {
    try {
      const { data, error } = await supabaseAdmin
        .from('will_events')
        .insert({
          user_id: userId,
          timestamp: willEvent.timestamp,
          source_entry_id: willEvent.source_entry_id || null,
          source_component_id: willEvent.source_component_id || null,
          situation: willEvent.situation,
          inferred_impulse: willEvent.inferred_impulse,
          observed_action: willEvent.observed_action,
          cost: willEvent.cost,
          meaning: willEvent.meaning || null,
          confidence: willEvent.confidence,
          emotion_at_time: willEvent.emotion_at_time || null,
          identity_pressure: willEvent.identity_pressure || null,
          related_decision_id: willEvent.related_decision_id || null,
          metadata: willEvent.metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId }, 'Failed to save will event');
        throw error;
      }

      logger.debug({ userId, willEventId: data.id }, 'Saved will event');
      return data as WillEvent;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save will event');
      throw error;
    }
  }

  /**
   * Get will events for user
   */
  async getWillEvents(
    userId: string,
    filters: {
      timeWindow?: number; // days
      minConfidence?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<WillEvent[]> {
    try {
      let query = supabaseAdmin
        .from('will_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (filters.minConfidence !== undefined) {
        query = query.gte('confidence', filters.minConfidence);
      }

      if (filters.timeWindow) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filters.timeWindow);
        query = query.gte('timestamp', cutoffDate.toISOString());
      }

      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to get will events');
        throw error;
      }

      return (data || []) as WillEvent[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get will events');
      return [];
    }
  }

  /**
   * Get agency frequency (events per time period)
   */
  async getAgencyFrequency(userId: string, timeWindowDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

      const { count, error } = await supabaseAdmin
        .from('will_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('timestamp', cutoffDate.toISOString());

      if (error) {
        logger.error({ error, userId }, 'Failed to get agency frequency');
        return 0;
      }

      return (count || 0) / timeWindowDays; // events per day
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get agency frequency');
      return 0;
    }
  }

  /**
   * Get agency metrics
   */
  async getAgencyMetrics(userId: string, timeWindowDays: number = 30): Promise<AgencyMetrics> {
    try {
      const events = await this.getWillEvents(userId, { timeWindow: timeWindowDays });
      
      if (events.length === 0) {
        return {
          density: 0,
          trend: 'stable',
          last_event: null,
          total_events: 0,
        };
      }

      // Compute trend by comparing first half vs second half
      const midpoint = Math.floor(events.length / 2);
      const firstHalf = events.slice(0, midpoint);
      const secondHalf = events.slice(midpoint);

      const firstHalfRate = firstHalf.length / (timeWindowDays / 2);
      const secondHalfRate = secondHalf.length / (timeWindowDays / 2);

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (secondHalfRate > firstHalfRate * 1.2) {
        trend = 'increasing';
      } else if (secondHalfRate < firstHalfRate * 0.8) {
        trend = 'decreasing';
      }

      const density = events.length / timeWindowDays;
      const last_event = events[0]?.timestamp || null;

      return {
        density,
        trend,
        last_event,
        total_events: events.length,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get agency metrics');
      return {
        density: 0,
        trend: 'stable',
        last_event: null,
        total_events: 0,
      };
    }
  }
}

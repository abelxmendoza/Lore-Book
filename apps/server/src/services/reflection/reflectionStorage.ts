import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Reflection, ReflectionInsight } from './types';

/**
 * Handles storage and retrieval of reflections
 */
export class ReflectionStorage {
  /**
   * Save reflections
   */
  async saveReflections(reflections: Reflection[]): Promise<Reflection[]> {
    if (reflections.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('reflections')
        .insert(
          reflections.map(r => ({
            user_id: r.user_id,
            entry_id: r.entry_id,
            text: r.text,
            type: r.type,
            confidence: r.confidence,
            timestamp: r.timestamp || new Date().toISOString(),
            metadata: r.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save reflections');
        return [];
      }

      return (data || []) as Reflection[];
    } catch (error) {
      logger.error({ error }, 'Failed to save reflections');
      return [];
    }
  }

  /**
   * Get reflections for a user
   */
  async getReflections(userId: string, type?: string): Promise<Reflection[]> {
    try {
      let query = supabaseAdmin
        .from('reflections')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get reflections');
        return [];
      }

      return (data || []) as Reflection[];
    } catch (error) {
      logger.error({ error }, 'Failed to get reflections');
      return [];
    }
  }

  /**
   * Save insights
   */
  async saveInsights(insights: ReflectionInsight[]): Promise<void> {
    if (insights.length === 0) return;

    try {
      const { error } = await supabaseAdmin
        .from('reflection_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            confidence: i.confidence,
            timestamp: i.timestamp,
            reflection_ids: i.reflection_ids || [],
            metadata: i.metadata || {},
          }))
        );

      if (error) {
        logger.error({ error }, 'Failed to save reflection insights');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save reflection insights');
    }
  }
}


import { logger } from '../logger';
import type { Insight, InsightType } from '../types';
import { supabaseAdmin } from './supabaseClient';

/**
 * Insight Storage Service
 * Stores and retrieves insights from database
 * Integrates with existing Python insight engine
 */
class InsightStorageService {
  /**
   * Store an insight
   */
  async storeInsight(insight: Omit<Insight, 'id' | 'created_at' | 'updated_at'>): Promise<Insight> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .insert({
        user_id: insight.user_id,
        insight_type: insight.insight_type,
        text: insight.text,
        confidence: insight.confidence,
        source_component_ids: insight.source_component_ids || [],
        source_entry_ids: insight.source_entry_ids || [],
        tags: insight.tags || [],
        metadata: insight.metadata || {},
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to store insight');
      throw error;
    }

    return data as Insight;
  }

  /**
   * Store multiple insights
   */
  async storeInsights(insights: Array<Omit<Insight, 'id' | 'created_at' | 'updated_at'>>): Promise<Insight[]> {
    if (insights.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('insights')
      .insert(
        insights.map(insight => ({
          user_id: insight.user_id,
          insight_type: insight.insight_type,
          text: insight.text,
          confidence: insight.confidence,
          source_component_ids: insight.source_component_ids || [],
          source_entry_ids: insight.source_entry_ids || [],
          tags: insight.tags || [],
          metadata: insight.metadata || {},
        }))
      )
      .select();

    if (error) {
      logger.error({ error }, 'Failed to store insights');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get recent insights for user
   */
  async getRecentInsights(
    userId: string,
    limit: number = 20,
    insightType?: InsightType
  ): Promise<Insight[]> {
    let query = supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (insightType) {
      query = query.eq('insight_type', insightType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to get recent insights');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get insights by type
   */
  async getInsightsByType(
    userId: string,
    insightType: InsightType,
    limit: number = 50
  ): Promise<Insight[]> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .eq('insight_type', insightType)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, userId, insightType }, 'Failed to get insights by type');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get high-confidence insights
   */
  async getHighConfidenceInsights(
    userId: string,
    minConfidence: number = 0.7,
    limit: number = 50
  ): Promise<Insight[]> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, userId }, 'Failed to get high confidence insights');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get insights for a component
   */
  async getInsightsForComponent(componentId: string, userId: string): Promise<Insight[]> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .contains('source_component_ids', [componentId]);

    if (error) {
      logger.error({ error, componentId, userId }, 'Failed to get insights for component');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get insights for an entry
   */
  async getInsightsForEntry(entryId: string, userId: string): Promise<Insight[]> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .contains('source_entry_ids', [entryId]);

    if (error) {
      logger.error({ error, entryId, userId }, 'Failed to get insights for entry');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Get trend insights (insights over time)
   */
  async getTrendInsights(
    userId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<Insight[]> {
    let query = supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .in('insight_type', ['trend', 'pattern', 'correlation'])
      .order('created_at', { ascending: false });

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to get trend insights');
      throw error;
    }

    return (data ?? []) as Insight[];
  }

  /**
   * Delete old insights (cleanup)
   */
  async deleteOldInsights(userId: string, olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabaseAdmin
      .from('insights')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', cutoffDate.toISOString())
      .select();

    if (error) {
      logger.error({ error, userId }, 'Failed to delete old insights');
      throw error;
    }

    return data?.length || 0;
  }

  /**
   * Update insight confidence
   */
  async updateInsightConfidence(
    insightId: string,
    userId: string,
    confidence: number
  ): Promise<Insight> {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .update({
        confidence: Math.max(0, Math.min(1, confidence)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', insightId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ error, insightId, userId }, 'Failed to update insight confidence');
      throw error;
    }

    return data as Insight;
  }
}

export const insightStorageService = new InsightStorageService();


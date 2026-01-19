import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ResolvedActivity, ExtractedActivity, ActivityMention } from './types';

/**
 * Storage layer for activities and mentions
 */
export class ActivityStorage {
  /**
   * Load all activities for a user
   */
  async loadAll(userId: string): Promise<ResolvedActivity[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to load activities');
        return [];
      }

      return (data || []).map(a => ({
        id: a.id,
        name: a.name,
        normalized_name: a.normalized_name,
        category: a.category,
        intensity: a.intensity,
        embedding: a.embedding,
        metadata: a.metadata || {},
        user_id: a.user_id,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load activities');
      return [];
    }
  }

  /**
   * Create a new activity
   */
  async createActivity(
    userId: string,
    activity: {
      name: string;
      normalized_name: string;
      category?: string;
      intensity?: number;
      embedding?: number[];
      metadata?: Record<string, any>;
    }
  ): Promise<ResolvedActivity> {
    try {
      const { data, error } = await supabaseAdmin
        .from('activities')
        .insert({
          user_id: userId,
          name: activity.name,
          normalized_name: activity.normalized_name,
          category: activity.category || null,
          intensity: activity.intensity || null,
          embedding: activity.embedding || null,
          metadata: activity.metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create activity');
        throw error;
      }

      return {
        id: data.id,
        name: data.name,
        normalized_name: data.normalized_name,
        category: data.category,
        intensity: data.intensity,
        embedding: data.embedding,
        metadata: data.metadata || {},
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create activity');
      throw error;
    }
  }

  /**
   * Link activity to a journal entry
   */
  async linkActivity(activityId: string, extracted: ExtractedActivity): Promise<void> {
    try {
      if (!extracted.userId) {
        logger.warn({ extracted }, 'Missing userId in extracted activity');
        return;
      }

      const { error } = await supabaseAdmin
        .from('activity_mentions')
        .insert({
          user_id: extracted.userId,
          activity_id: activityId,
          memory_id: extracted.memoryId,
          raw_text: extracted.raw,
          extracted_name: extracted.extractedName,
          category: extracted.category,
          intensity: extracted.intensity,
        });

      if (error) {
        logger.error({ error, activityId, extracted }, 'Failed to link activity');
      }
    } catch (error) {
      logger.error({ error, activityId, extracted }, 'Failed to link activity');
    }
  }
}


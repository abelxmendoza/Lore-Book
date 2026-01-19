import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ToxicityEvent } from './types';

/**
 * Storage service for toxicity events
 */
export class ToxicityStorage {
  /**
   * Save a toxicity event
   */
  async save(
    userId: string,
    memoryId: string,
    event: ToxicityEvent,
    embedding: number[],
    timestamp: string
  ): Promise<any> {
    try {
      const { data: row, error: insertError } = await supabase
        .from('toxicity_events')
        .insert({
          user_id: userId,
          memory_id: memoryId,
          entity_type: event.entityType,
          entity_name: event.entityName,
          category: event.category,
          red_flags: event.redFlags,
          severity: event.severity,
          pattern: event.pattern,
          prediction: event.prediction,
          summary: event.summary,
          embedding,
          timestamp,
        })
        .select()
        .single();

      if (insertError) {
        logger.error({ error: insertError, event }, 'Error inserting toxicity event');
        throw insertError;
      }

      logger.debug({ eventId: row.id, category: event.category }, 'Saved toxicity event');
      return row;
    } catch (error) {
      logger.error({ error, event }, 'Error saving toxicity event');
      throw error;
    }
  }

  /**
   * Get toxicity events for a user
   */
  async getEvents(userId: string, limit: number = 100): Promise<ToxicityEvent[]> {
    try {
      const { data, error } = await supabase
        .from('toxicity_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching toxicity events');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityName: row.entity_name,
        category: row.category,
        redFlags: row.red_flags || [],
        severity: row.severity,
        pattern: row.pattern,
        prediction: row.prediction,
        summary: row.summary,
        embedding: row.embedding || [],
        timestamp: row.timestamp,
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting toxicity events');
      return [];
    }
  }

  /**
   * Get toxicity events by entity
   */
  async getEventsByEntity(
    userId: string,
    entityType: string,
    entityName: string
  ): Promise<ToxicityEvent[]> {
    try {
      const { data, error } = await supabase
        .from('toxicity_events')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_type', entityType)
        .eq('entity_name', entityName.toLowerCase())
        .order('timestamp', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching toxicity events by entity');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityName: row.entity_name,
        category: row.category,
        redFlags: row.red_flags || [],
        severity: row.severity,
        pattern: row.pattern,
        prediction: row.prediction,
        summary: row.summary,
        embedding: row.embedding || [],
        timestamp: row.timestamp,
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting toxicity events by entity');
      return [];
    }
  }

  /**
   * Get a single toxicity event by ID
   */
  async getEvent(eventId: string): Promise<ToxicityEvent | null> {
    try {
      const { data, error } = await supabase
        .from('toxicity_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) {
        logger.error({ error }, 'Error fetching toxicity event');
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        entityType: data.entity_type,
        entityName: data.entity_name,
        category: data.category,
        redFlags: data.red_flags || [],
        severity: data.severity,
        pattern: data.pattern,
        prediction: data.prediction,
        summary: data.summary,
        embedding: data.embedding || [],
        timestamp: data.timestamp,
        memory_id: data.memory_id,
        user_id: data.user_id,
        created_at: data.created_at,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting toxicity event');
      return null;
    }
  }
}


import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ResolvedEvent, ExtractedEvent, EventMention } from './types';

/**
 * Storage layer for events and mentions
 */
export class EventStorage {
  /**
   * Load all events for a user
   */
  async loadAll(userId: string): Promise<ResolvedEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to load events');
        return [];
      }

      return (data || []).map(e => ({
        id: e.id,
        canonical_title: e.canonical_title,
        summary: e.summary,
        start_time: e.start_time,
        end_time: e.end_time,
        confidence: e.confidence,
        embedding: e.embedding,
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load events');
      return [];
    }
  }

  /**
   * Create a new event
   */
  async createEvent(
    userId: string,
    event: {
      canonical_title: string;
      summary?: string;
      start_time?: string;
      end_time?: string;
      embedding?: number[];
      confidence?: number;
    }
  ): Promise<ResolvedEvent> {
    try {
      const { data, error } = await supabaseAdmin
        .from('events')
        .insert({
          user_id: userId,
          canonical_title: event.canonical_title,
          summary: event.summary,
          start_time: event.start_time,
          end_time: event.end_time,
          embedding: event.embedding || null,
          confidence: event.confidence || 1.0,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create event');
        throw error;
      }

      return {
        id: data.id,
        canonical_title: data.canonical_title,
        summary: data.summary,
        start_time: data.start_time,
        end_time: data.end_time,
        confidence: data.confidence,
        embedding: data.embedding,
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create event');
      throw error;
    }
  }

  /**
   * Link event to a journal entry
   */
  async linkEvent(eventId: string, extracted: ExtractedEvent): Promise<void> {
    try {
      if (!extracted.userId) {
        logger.warn({ extracted }, 'Missing userId in extracted event');
        return;
      }

      const { error } = await supabaseAdmin
        .from('event_mentions')
        .insert({
          user_id: extracted.userId,
          event_id: eventId,
          memory_id: extracted.memoryId,
          raw_text: extracted.raw,
          timestamp: extracted.timestamp,
          location: extracted.location,
        });

      if (error) {
        logger.error({ error, eventId, extracted }, 'Failed to link event');
      }
    } catch (error) {
      logger.error({ error, eventId, extracted }, 'Failed to link event');
    }
  }
}


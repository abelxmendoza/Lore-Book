import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EmotionEventResolved, RawEmotionSignal, EmotionMention } from './types';

/**
 * Storage layer for emotion events and mentions
 */
export class EmotionStorage {
  /**
   * Save emotion event and mentions
   */
  async saveEvent(
    userId: string,
    event: EmotionEventResolved,
    signals: RawEmotionSignal[]
  ): Promise<EmotionEventResolved> {
    try {
      // Insert emotion event
      const { data, error } = await supabaseAdmin
        .from('emotion_events')
        .insert({
          user_id: userId,
          emotion: event.emotion,
          subtype: event.subtype,
          intensity: event.intensity,
          polarity: event.polarity,
          triggers: event.triggers || [],
          embedding: event.embedding || null,
          start_time: event.startTime,
          end_time: event.endTime,
          confidence: event.confidence,
          metadata: event.metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save emotion event');
        throw error;
      }

      // Save mentions
      await this.saveMentions(data.id, signals);

      return {
        id: data.id,
        emotion: data.emotion,
        subtype: data.subtype,
        intensity: data.intensity,
        polarity: data.polarity,
        triggers: data.triggers || [],
        embedding: data.embedding,
        startTime: data.start_time,
        endTime: data.end_time,
        confidence: data.confidence,
        metadata: data.metadata || {},
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save emotion event');
      throw error;
    }
  }

  /**
   * Save emotion mentions
   */
  async saveMentions(emotionId: string, signals: RawEmotionSignal[]): Promise<void> {
    if (signals.length === 0) return;

    try {
      const mentions = signals.map(s => ({
        emotion_id: emotionId,
        memory_id: s.memoryId,
        evidence: s.text.substring(0, 500), // Limit evidence text
      }));

      const { error } = await supabaseAdmin
        .from('emotion_mentions')
        .insert(mentions);

      if (error) {
        logger.error({ error }, 'Failed to save emotion mentions');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save emotion mentions');
    }
  }

  /**
   * Load all emotion events for a user
   */
  async loadAll(userId: string): Promise<EmotionEventResolved[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('emotion_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to load emotion events');
        return [];
      }

      return (data || []).map(e => ({
        id: e.id,
        emotion: e.emotion,
        subtype: e.subtype,
        intensity: e.intensity,
        polarity: e.polarity,
        triggers: e.triggers || [],
        embedding: e.embedding,
        startTime: e.start_time,
        endTime: e.end_time,
        confidence: e.confidence,
        metadata: e.metadata || {},
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load emotion events');
      return [];
    }
  }
}


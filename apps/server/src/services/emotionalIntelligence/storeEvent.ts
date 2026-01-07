import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EmotionalEvent } from './types';

/**
 * Stores emotional event in database
 */
export async function storeEmotionalEvent(
  event: EmotionalEvent,
  entryId: string,
  userId: string
): Promise<any> {
  try {
    const { data, error } = await supabaseAdmin
      .from('emotional_events')
      .insert({
        user_id: userId,
        entry_id: entryId,
        emotion: event.emotion,
        intensity: event.intensity,
        trigger: event.trigger || null,
        context: event.context || {},
        behavior_response: event.behaviorResponse || null,
        regulation_strategy: event.regulationStrategy || null,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, event }, 'Error storing emotional event');
      throw error;
    }

    return data;
  } catch (error) {
    logger.error({ error, event }, 'Error storing emotional event');
    throw error;
  }
}

/**
 * Gets all emotional events for a user
 */
export async function getAllEvents(userId: string): Promise<EmotionalEvent[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('emotional_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error }, 'Error fetching emotional events');
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      emotion: row.emotion,
      intensity: row.intensity,
      trigger: row.trigger,
      context: row.context || {},
      behaviorResponse: row.behavior_response,
      regulationStrategy: row.regulation_strategy,
      entry_id: row.entry_id,
      user_id: row.user_id,
      created_at: row.created_at,
    }));
  } catch (error) {
    logger.error({ error }, 'Error getting all events');
    return [];
  }
}


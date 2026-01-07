import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Conflict } from './types';

/**
 * Storage service for conflicts
 */
export class ConflictStorage {
  /**
   * Save a conflict
   */
  async saveConflict(
    userId: string,
    memoryId: string,
    conflict: Conflict,
    embedding: number[],
    timestamp: string
  ): Promise<any> {
    try {
      const { data: row, error: insertError } = await supabase
        .from('conflicts')
        .insert({
          user_id: userId,
          memory_id: memoryId,
          type: conflict.type,
          setting: conflict.setting,
          trigger: conflict.trigger,
          escalation: conflict.escalation,
          participants: conflict.participants,
          intensity: conflict.intensity,
          conflict_beats: conflict.conflictBeats,
          emotional_impact: conflict.emotionalImpact,
          outcome: conflict.outcome,
          summary: conflict.summary,
          embedding,
          timestamp,
        })
        .select()
        .single();

      if (insertError) {
        logger.error({ error: insertError, conflict }, 'Error inserting conflict');
        throw insertError;
      }

      logger.debug({ conflictId: row.id, type: conflict.type }, 'Saved conflict');
      return row;
    } catch (error) {
      logger.error({ error, conflict }, 'Error saving conflict');
      throw error;
    }
  }

  /**
   * Get conflicts for a user
   */
  async getConflicts(userId: string, limit: number = 100): Promise<Conflict[]> {
    try {
      const { data, error } = await supabase
        .from('conflicts')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching conflicts');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        type: row.type,
        setting: row.setting,
        trigger: row.trigger,
        escalation: row.escalation,
        participants: row.participants || [],
        intensity: row.intensity,
        conflictBeats: row.conflict_beats || [],
        emotionalImpact: row.emotional_impact || {
          before: '',
          during: '',
          after: '',
        },
        outcome: row.outcome,
        summary: row.summary,
        embedding: row.embedding || [],
        timestamp: row.timestamp,
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting conflicts');
      return [];
    }
  }

  /**
   * Get a single conflict by ID
   */
  async getConflict(conflictId: string): Promise<Conflict | null> {
    try {
      const { data, error } = await supabase
        .from('conflicts')
        .select('*')
        .eq('id', conflictId)
        .single();

      if (error) {
        logger.error({ error }, 'Error fetching conflict');
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        type: data.type,
        setting: data.setting,
        trigger: data.trigger,
        escalation: data.escalation,
        participants: data.participants || [],
        intensity: data.intensity,
        conflictBeats: data.conflict_beats || [],
        emotionalImpact: data.emotional_impact || {
          before: '',
          during: '',
          after: '',
        },
        outcome: data.outcome,
        summary: data.summary,
        embedding: data.embedding || [],
        timestamp: data.timestamp,
        memory_id: data.memory_id,
        user_id: data.user_id,
        created_at: data.created_at,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting conflict');
      return null;
    }
  }
}


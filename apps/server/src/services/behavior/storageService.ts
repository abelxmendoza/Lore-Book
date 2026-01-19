import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { BehaviorLoop, NormalizedBehavior, RawBehaviorSignal } from './types';

/**
 * Storage service for behavior events and loops
 */
export class BehaviorStorage {
  /**
   * Save normalized behaviors and their mentions
   */
  async saveBehaviors(
    userId: string,
    behaviors: NormalizedBehavior[],
    rawSignals: RawBehaviorSignal[]
  ): Promise<any[]> {
    const inserted: any[] = [];

    try {
      for (let i = 0; i < behaviors.length; i++) {
        const behavior = behaviors[i];
        const rawSignal = rawSignals[i];

        // Insert behavior event
        const { data: row, error: insertError } = await supabase
          .from('behavior_events')
          .insert({
            user_id: userId,
            behavior: behavior.behavior,
            subtype: behavior.subtype,
            intensity: behavior.intensity,
            polarity: behavior.polarity,
            embedding: behavior.embedding,
            timestamp: behavior.timestamp,
            evidence: behavior.evidence,
            confidence: behavior.confidence,
          })
          .select()
          .single();

        if (insertError) {
          logger.error({ error: insertError, behavior }, 'Error inserting behavior event');
          continue;
        }

        if (!row) continue;

        // Insert behavior mention
        const { error: mentionError } = await supabaseAdmin.from('behavior_mentions').insert({
          behavior_id: row.id,
          memory_id: rawSignal.memoryId,
          evidence: rawSignal.text,
        });

        if (mentionError) {
          logger.error({ error: mentionError }, 'Error inserting behavior mention');
        }

        inserted.push(row);
      }

      logger.debug({ count: inserted.length }, 'Saved behavior events');
    } catch (error) {
      logger.error({ error }, 'Error saving behaviors');
    }

    return inserted;
  }

  /**
   * Save behavior loops
   */
  async saveLoops(userId: string, loops: BehaviorLoop[]): Promise<void> {
    try {
      for (const loop of loops) {
        const { error } = await supabaseAdmin.from('behavior_loops').insert({
          user_id: userId,
          loop_name: loop.loopName,
          category: loop.category,
          behaviors: loop.behaviors,
          triggers: loop.triggers,
          consequences: loop.consequences,
          loop_length: loop.loopLength,
          occurrences: loop.occurrences,
          confidence: loop.confidence,
          first_seen: loop.firstSeen,
          last_seen: loop.lastSeen,
        });

        if (error) {
          logger.error({ error, loop }, 'Error inserting behavior loop');
        }
      }

      logger.debug({ count: loops.length }, 'Saved behavior loops');
    } catch (error) {
      logger.error({ error }, 'Error saving loops');
    }
  }

  /**
   * Get behavior events for a user
   */
  async getBehaviors(userId: string, limit: number = 100): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('behavior_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching behaviors');
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error({ error }, 'Error getting behaviors');
      return [];
    }
  }

  /**
   * Get behavior loops for a user
   */
  async getLoops(userId: string): Promise<BehaviorLoop[]> {
    try {
      const { data, error } = await supabase
        .from('behavior_loops')
        .select('*')
        .eq('user_id', userId)
        .order('last_seen', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching loops');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        loopName: row.loop_name,
        category: row.category,
        behaviors: row.behaviors || [],
        triggers: row.triggers || [],
        consequences: row.consequences || [],
        occurrences: row.occurrences,
        loopLength: row.loop_length,
        confidence: row.confidence,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting loops');
      return [];
    }
  }
}


/**
 * Interpretation Service — reconsolidation layering.
 *
 * Manages non-destructive reinterpretation of events and entries over time.
 * Each interpretation is a new row — past records are never overwritten.
 * Interpretations can supersede each other, forming a perspective chain.
 *
 * Example:
 *   Interpretation 1: "I thought this failure was the end."
 *   Interpretation 2 (supersedes 1): "Looking back, it was necessary."
 *   Both coexist. The chain shows how meaning has evolved.
 *
 * Used by: epiphanyEngine (writes AI reframes), future user-facing reinterpretation UI.
 * DO NOT use this to overwrite original event content — use event_interpretations only.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { ingestEventInterpretation } from './narrativeSpine/narrativeSpineIngestion';

export type InterpretationParams = {
  eventId?: string;
  journalEntryId?: string;
  interpretation: string;
  emotionalValence?: number;    // -1.0 to 1.0
  narrativeRole?: 'origin' | 'turning_point' | 'resolution' | 'recurring';
  supersedingId?: string;       // ID of the interpretation this replaces (optional)
  source?: 'ai' | 'user';
  metadata?: Record<string, unknown>;
};

export type EventInterpretation = {
  id: string;
  user_id: string;
  event_id: string | null;
  journal_entry_id: string | null;
  interpretation: string;
  emotional_valence: number | null;
  narrative_role: string | null;
  written_at: string;
  supersedes_id: string | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

class InterpretationService {
  /**
   * Write a new interpretation for an event or entry.
   * Never overwrites existing interpretations — always appends.
   */
  async addInterpretation(
    userId: string,
    params: InterpretationParams
  ): Promise<EventInterpretation> {
    const { data, error } = await supabaseAdmin
      .from('event_interpretations')
      .insert({
        user_id: userId,
        event_id: params.eventId ?? null,
        journal_entry_id: params.journalEntryId ?? null,
        interpretation: params.interpretation,
        emotional_valence: params.emotionalValence ?? null,
        narrative_role: params.narrativeRole ?? null,
        supersedes_id: params.supersedingId ?? null,
        source: params.source ?? 'ai',
        metadata: params.metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, userId }, 'Failed to add interpretation');
      throw error;
    }

    ingestEventInterpretation(userId, data.id);

    return data as EventInterpretation;
  }

  /**
   * Get the full perspective chain for an event or entry, ordered oldest→newest.
   * Shows how interpretation has evolved over time.
   */
  async getChain(
    userId: string,
    params: { eventId?: string; journalEntryId?: string }
  ): Promise<EventInterpretation[]> {
    let query = supabaseAdmin
      .from('event_interpretations')
      .select('*')
      .eq('user_id', userId)
      .order('written_at', { ascending: true });

    if (params.eventId) query = query.eq('event_id', params.eventId);
    else if (params.journalEntryId) query = query.eq('journal_entry_id', params.journalEntryId);
    else return [];

    const { data, error } = await query;
    if (error) {
      logger.warn({ error, userId }, 'Failed to get interpretation chain');
      return [];
    }
    return (data ?? []) as EventInterpretation[];
  }

  /**
   * Get only the most recent (current) interpretation — for RAG context injection.
   * The current interpretation is the most recently written, regardless of chain depth.
   */
  async getLatestInterpretation(
    userId: string,
    params: { eventId?: string; journalEntryId?: string }
  ): Promise<EventInterpretation | null> {
    let query = supabaseAdmin
      .from('event_interpretations')
      .select('*')
      .eq('user_id', userId)
      .order('written_at', { ascending: false })
      .limit(1);

    if (params.eventId) query = query.eq('event_id', params.eventId);
    else if (params.journalEntryId) query = query.eq('journal_entry_id', params.journalEntryId);
    else return null;

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.warn({ error, userId }, 'Failed to get latest interpretation');
      return null;
    }
    return (data ?? null) as EventInterpretation | null;
  }

  /**
   * Get recent interpretations across all events for a user.
   * Used by RAG to surface active reframes during chat.
   */
  async getRecentInterpretations(
    userId: string,
    limit = 10
  ): Promise<EventInterpretation[]> {
    const { data, error } = await supabaseAdmin
      .from('event_interpretations')
      .select('*')
      .eq('user_id', userId)
      .order('written_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get recent interpretations');
      return [];
    }
    return (data ?? []) as EventInterpretation[];
  }
}

export const interpretationService = new InterpretationService();

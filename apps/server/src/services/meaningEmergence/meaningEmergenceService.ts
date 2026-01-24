/**
 * Meaning Emergence Service
 * 
 * Tracks when events become meaningful (retrospective significance):
 * - Records when events happened vs when they were recorded
 * - Tracks when meaning was recognized
 * - Monitors reinterpretation over time
 * - Calculates significance levels
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { MemoryEntry } from '../../types';

export interface MeaningEmergence {
  id: string;
  user_id: string;
  event_entry_id: string;
  event_date: string;
  recorded_date: string;
  meaning_recognized_date?: string;
  significance_level: number; // 0-1
  reinterpretation_count: number;
  interpretations: Array<{
    date: string;
    interpretation: string;
    significance: number;
  }>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

class MeaningEmergenceService {
  /**
   * Track meaning emergence for an entry
   */
  async trackMeaning(
    userId: string,
    entry: MemoryEntry
  ): Promise<MeaningEmergence> {
    try {
      // Check if already tracked
      const existing = await this.getMeaningForEntry(userId, entry.id);
      if (existing) {
        return existing;
      }

      const eventDate = new Date(entry.date);
      const recordedDate = new Date(entry.created_at || entry.date);

      const meaning: Omit<MeaningEmergence, 'id' | 'created_at' | 'updated_at'> = {
        user_id: userId,
        event_entry_id: entry.id,
        event_date: eventDate.toISOString(),
        recorded_date: recordedDate.toISOString(),
        meaning_recognized_date: undefined,
        significance_level: 0.5, // Initial neutral significance
        reinterpretation_count: 0,
        interpretations: [],
        metadata: {},
      };

      const { data, error } = await supabaseAdmin
        .from('meaning_emergence')
        .insert(meaning)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as MeaningEmergence;
    } catch (error) {
      logger.error({ err: error, userId, entryId: entry.id }, 'Failed to track meaning');
      throw error;
    }
  }

  /**
   * Record when meaning was recognized
   */
  async recordMeaningRecognition(
    userId: string,
    entryId: string,
    interpretation: string,
    significance: number
  ): Promise<MeaningEmergence> {
    try {
      const existing = await this.getMeaningForEntry(userId, entryId);
      if (!existing) {
        throw new Error('Meaning tracking not found for entry');
      }

      const newInterpretation = {
        date: new Date().toISOString(),
        interpretation,
        significance: Math.max(0, Math.min(1, significance)),
      };

      const interpretations = [...(existing.interpretations || []), newInterpretation];
      const reinterpretationCount = interpretations.length - 1; // First is not a reinterpretation
      const maxSignificance = Math.max(...interpretations.map(i => i.significance));

      const update: Partial<MeaningEmergence> = {
        meaning_recognized_date: existing.meaning_recognized_date || new Date().toISOString(),
        significance_level: maxSignificance,
        reinterpretation_count: reinterpretationCount,
        interpretations,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('meaning_emergence')
        .update(update)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as MeaningEmergence;
    } catch (error) {
      logger.error({ err: error }, 'Failed to record meaning recognition');
      throw error;
    }
  }

  /**
   * Calculate time to meaning (days from event to recognition)
   */
  async calculateTimeToMeaning(
    userId: string,
    entryId: string
  ): Promise<number | null> {
    try {
      const meaning = await this.getMeaningForEntry(userId, entryId);
      if (!meaning || !meaning.meaning_recognized_date) {
        return null;
      }

      const eventDate = new Date(meaning.event_date);
      const recognizedDate = new Date(meaning.meaning_recognized_date);
      const daysDiff = Math.floor(
        (recognizedDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return daysDiff;
    } catch (error) {
      logger.error({ err: error }, 'Failed to calculate time to meaning');
      return null;
    }
  }

  /**
   * Get meaning for an entry
   */
  async getMeaningForEntry(
    userId: string,
    entryId: string
  ): Promise<MeaningEmergence | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('meaning_emergence')
        .select('*')
        .eq('user_id', userId)
        .eq('event_entry_id', entryId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as MeaningEmergence;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get meaning');
      return null;
    }
  }

  /**
   * Get entries with high significance
   */
  async getHighSignificanceEntries(
    userId: string,
    threshold: number = 0.7,
    limit: number = 20
  ): Promise<MeaningEmergence[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('meaning_emergence')
        .select('*')
        .eq('user_id', userId)
        .gte('significance_level', threshold)
        .order('significance_level', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []) as MeaningEmergence[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get high significance entries');
      return [];
    }
  }

  /**
   * Detect when entry is referenced later (indicating significance)
   */
  async detectSignificanceFromReferences(
    userId: string,
    entryId: string
  ): Promise<number> {
    try {
      // Find entries that reference this entry
      // This would use semantic search or explicit references
      const { data: referencingEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, created_at')
        .eq('user_id', userId)
        .neq('id', entryId)
        .gt('created_at', new Date().toISOString()) // After the entry
        .limit(100);

      if (!referencingEntries || referencingEntries.length === 0) {
        return 0;
      }

      // Count references (simplified - would use semantic similarity)
      // For now, return a score based on how many entries exist after
      const referenceCount = referencingEntries.length;
      const significance = Math.min(1, referenceCount / 10); // Max significance at 10 references

      return significance;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to detect significance from references');
      return 0;
    }
  }
}

export const meaningEmergenceService = new MeaningEmergenceService();

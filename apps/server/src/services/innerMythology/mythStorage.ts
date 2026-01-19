import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { MythElement, MythMotif, MythArchetype, InnerMyth } from './mythTypes';

/**
 * Storage service for inner mythology data
 */
export class MythStorage {
  /**
   * Save myth elements
   */
  async saveElements(userId: string, elements: MythElement[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const element of elements) {
        const { data: row, error } = await supabase
          .from('myth_elements')
          .insert({
            user_id: userId,
            memory_id: element.memory_id || null,
            category: element.category,
            text: element.text,
            evidence: element.evidence,
            timestamp: element.timestamp,
            intensity: element.intensity,
            symbolic_weight: element.symbolic_weight,
            confidence: element.confidence,
            embedding: element.embedding || null,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, element }, 'Error inserting myth element');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved myth elements');
    } catch (error) {
      logger.error({ error }, 'Error saving myth elements');
    }

    return saved;
  }

  /**
   * Save motifs
   */
  async saveMotifs(userId: string, motifs: MythMotif[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const motif of motifs) {
        // Insert motif
        const { data: motifRow, error: motifError } = await supabase
          .from('myth_motifs')
          .insert({
            user_id: userId,
            motif_type: motif.motifType,
          })
          .select()
          .single();

        if (motifError) {
          logger.error({ error: motifError, motif }, 'Error inserting motif');
          continue;
        }

        // Link elements to motif
        for (const element of motif.elements) {
          if (element.id) {
            await supabaseAdmin.from('myth_motif_elements').insert({
              motif_id: motifRow.id,
              element_id: element.id,
            });
          }
        }

        saved.push(motifRow);
      }

      logger.debug({ count: saved.length }, 'Saved myth motifs');
    } catch (error) {
      logger.error({ error }, 'Error saving motifs');
    }

    return saved;
  }

  /**
   * Save archetypes
   */
  async saveArchetypes(userId: string, mythId: string, archetypes: MythArchetype[]): Promise<void> {
    try {
      for (const archetype of archetypes) {
        await supabaseAdmin.from('myth_archetypes').insert({
          user_id: userId,
          myth_id: mythId,
          archetype: archetype.archetype,
          evidence: archetype.evidence,
        });
      }

      logger.debug({ count: archetypes.length }, 'Saved myth archetypes');
    } catch (error) {
      logger.error({ error }, 'Error saving archetypes');
    }
  }

  /**
   * Save inner myth
   */
  async save(userId: string, myth: InnerMyth): Promise<any> {
    try {
      const { data: mythRow, error: mythError } = await supabase
        .from('inner_myths')
        .insert({
          user_id: userId,
          name: myth.name,
          themes: myth.themes,
          summary: myth.summary,
          data: myth,
        })
        .select()
        .single();

      if (mythError) {
        logger.error({ error: mythError, myth }, 'Error inserting myth');
        throw mythError;
      }

      // Link motifs to myth
      for (const motif of myth.motifs) {
        if (motif.id) {
          await supabaseAdmin.from('inner_myth_motifs').insert({
            myth_id: mythRow.id,
            motif_id: motif.id,
          });
        }
      }

      logger.debug({ mythId: mythRow.id }, 'Saved inner myth');
      return mythRow;
    } catch (error) {
      logger.error({ error, myth }, 'Error saving myth');
      throw error;
    }
  }

  /**
   * Get myths for a user
   */
  async getMyths(userId: string): Promise<InnerMyth[]> {
    try {
      const { data, error } = await supabase
        .from('inner_myths')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching myths');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        themes: row.themes || [],
        motifs: row.data?.motifs || [],
        summary: row.summary || '',
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting myths');
      return [];
    }
  }

  /**
   * Get elements for a user
   */
  async getElements(userId: string, limit: number = 100): Promise<MythElement[]> {
    try {
      const { data, error } = await supabase
        .from('myth_elements')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching elements');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        category: row.category,
        text: row.text,
        evidence: row.evidence,
        timestamp: row.timestamp,
        intensity: row.intensity,
        symbolic_weight: row.symbolic_weight,
        confidence: row.confidence,
        embedding: row.embedding || [],
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting elements');
      return [];
    }
  }
}


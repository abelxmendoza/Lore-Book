// =====================================================
// LOREKEEPER CORE BLUEPRINT
// Belief Evolution & Meaning Resolution (BEMRE)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EntryIR, KnowledgeType } from './types';

export type BeliefResolutionStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONTRADICTED'
  | 'ABANDONED'
  | 'UNRESOLVED';

export interface BeliefEvolution {
  id: string;
  belief_entry_id: string;
  user_id: string;
  belief_content: string;
  initial_timestamp: string;
  resolution_status: BeliefResolutionStatus;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  evolution_timeline: Array<{
    timestamp: string;
    status: BeliefResolutionStatus;
    evidence_id?: string;
    note?: string;
  }>;
  confidence: number;
  last_updated: string;
}

export interface BeliefResolutionWeight {
  status: BeliefResolutionStatus;
  weight: number;
}

/**
 * Belief Resolution Weights
 * Phase 3.5: Formalized as part of epistemic lattice system
 * These weights determine how beliefs contribute to analytics
 */
export const RESOLUTION_WEIGHTS: Record<BeliefResolutionStatus, number> = {
  SUPPORTED: 1.0,
  PARTIALLY_SUPPORTED: 0.7,
  CONTRADICTED: 0.0,
  ABANDONED: 0.0,
  UNRESOLVED: 0.5, // Default weight for unresolved
};

/**
 * Belief Analytics Weight Function
 * Phase 3.5: Integrated with epistemic lattice invariants
 */
export function beliefAnalyticsWeight(status: BeliefResolutionStatus): number {
  return RESOLUTION_WEIGHTS[status];
}

export class BEMREService {
  /**
   * Track belief evolution for a BELIEF entry
   */
  async trackBeliefEvolution(
    userId: string,
    beliefEntryId: string,
    beliefContent: string,
    timestamp: string
  ): Promise<BeliefEvolution> {
    try {
      // Check if evolution already exists
      const { data: existing } = await supabaseAdmin
        .from('belief_evolutions')
        .select('*')
        .eq('user_id', userId)
        .eq('belief_entry_id', beliefEntryId)
        .single();

      if (existing) {
        return this.mapToBeliefEvolution(existing);
      }

      // Create new evolution
      const evolution: Partial<BeliefEvolution> = {
        belief_entry_id: beliefEntryId,
        user_id: userId,
        belief_content: beliefContent,
        initial_timestamp: timestamp,
        resolution_status: 'UNRESOLVED',
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        evolution_timeline: [
          {
            timestamp,
            status: 'UNRESOLVED',
          },
        ],
        confidence: 0.5,
        last_updated: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabaseAdmin
        .from('belief_evolutions')
        .insert(evolution)
        .select()
        .single();

      if (error) throw error;

      logger.debug({ userId, beliefEntryId }, 'Tracked new belief evolution');
      return this.mapToBeliefEvolution(inserted);
    } catch (error) {
      logger.error({ error, userId, beliefEntryId }, 'Failed to track belief evolution');
      throw error;
    }
  }

  /**
   * Resolve belief against evidence
   */
  async resolveBelief(
    userId: string,
    beliefEntryId: string,
    evidenceEntryIds: string[],
    resolutionStatus: BeliefResolutionStatus
  ): Promise<BeliefEvolution> {
    try {
      const { data: evolution, error: fetchError } = await supabaseAdmin
        .from('belief_evolutions')
        .select('*')
        .eq('user_id', userId)
        .eq('belief_entry_id', beliefEntryId)
        .single();

      if (fetchError || !evolution) {
        throw new Error(`Belief evolution not found for entry ${beliefEntryId}`);
      }

      // Update evolution
      const updatedEvolution = {
        ...evolution,
        resolution_status: resolutionStatus,
        supporting_evidence_ids:
          resolutionStatus === 'SUPPORTED' || resolutionStatus === 'PARTIALLY_SUPPORTED'
            ? [...(evolution.supporting_evidence_ids || []), ...evidenceEntryIds]
            : evolution.supporting_evidence_ids || [],
        contradicting_evidence_ids:
          resolutionStatus === 'CONTRADICTED'
            ? [...(evolution.contradicting_evidence_ids || []), ...evidenceEntryIds]
            : evolution.contradicting_evidence_ids || [],
        evolution_timeline: [
          ...(evolution.evolution_timeline || []),
          {
            timestamp: new Date().toISOString(),
            status: resolutionStatus,
            evidence_id: evidenceEntryIds[0],
          },
        ],
        confidence: RESOLUTION_WEIGHTS[resolutionStatus],
        last_updated: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('belief_evolutions')
        .update(updatedEvolution)
        .eq('id', evolution.id)
        .select()
        .single();

      if (updateError) throw updateError;

      logger.debug(
        { userId, beliefEntryId, resolutionStatus },
        'Resolved belief evolution'
      );

      return this.mapToBeliefEvolution(updated);
    } catch (error) {
      logger.error({ error, userId, beliefEntryId }, 'Failed to resolve belief');
      throw error;
    }
  }

  /**
   * Get belief evolution for an entry
   */
  async getBeliefEvolution(
    userId: string,
    beliefEntryId: string
  ): Promise<BeliefEvolution | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('belief_evolutions')
        .select('*')
        .eq('user_id', userId)
        .eq('belief_entry_id', beliefEntryId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapToBeliefEvolution(data);
    } catch (error) {
      logger.debug({ error, userId, beliefEntryId }, 'Failed to get belief evolution');
      return null;
    }
  }

  /**
   * Get analytics weight for a belief
   */
  getAnalyticsWeight(resolutionStatus: BeliefResolutionStatus): number {
    return RESOLUTION_WEIGHTS[resolutionStatus];
  }

  /**
   * Check if belief can be used in patterns
   */
  canUseInPatterns(resolutionStatus: BeliefResolutionStatus): boolean {
    return (
      resolutionStatus === 'SUPPORTED' || resolutionStatus === 'PARTIALLY_SUPPORTED'
    );
  }

  /**
   * Map database record to BeliefEvolution
   */
  private mapToBeliefEvolution(data: any): BeliefEvolution {
    return {
      id: data.id,
      belief_entry_id: data.belief_entry_id,
      user_id: data.user_id,
      belief_content: data.belief_content,
      initial_timestamp: data.initial_timestamp,
      resolution_status: data.resolution_status,
      supporting_evidence_ids: data.supporting_evidence_ids || [],
      contradicting_evidence_ids: data.contradicting_evidence_ids || [],
      evolution_timeline: data.evolution_timeline || [],
      confidence: data.confidence || 0.5,
      last_updated: data.last_updated,
    };
  }
}

export const bemreService = new BEMREService();


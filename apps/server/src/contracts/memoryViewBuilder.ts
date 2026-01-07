// =====================================================
// MEMORY VIEW BUILDER
// Purpose: Build filtered, typed, safe memory views based on contracts
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import type { KnowledgeUnit } from '../services/knowledgeTypeEngineService';
import type { SensemakingContract } from './sensemakingContract';
import { contractResolver } from './contractResolver';

/**
 * Filtered memory view
 */
export interface MemoryView {
  units: KnowledgeUnit[];
  contract: SensemakingContract;
  metadata: {
    total_units: number;
    filtered_units: number;
    filter_reasons: string[];
  };
}

/**
 * Memory View Builder
 * 
 * Builds safe, filtered memory views based on contracts.
 * 
 * Architecture:
 * Memory Graph → Sensemaking Contract → Filtered, Typed, Safe View
 */
export class MemoryViewBuilder {
  /**
   * Build a memory view from knowledge units
   */
  buildView(
    units: KnowledgeUnit[],
    contract: SensemakingContract,
    options: {
      referenceDate?: Date;
    } = {}
  ): MemoryView {
    const totalUnits = units.length;

    // Filter units by contract
    const filteredUnits = contractResolver.filterByContract(units, contract, options);

    // Collect filter reasons for debugging
    const filterReasons: string[] = [];
    const filteredCount = totalUnits - filteredUnits.length;
    if (filteredCount > 0) {
      filterReasons.push(`${filteredCount} units filtered by contract rules`);
    }

    return {
      units: filteredUnits,
      contract,
      metadata: {
        total_units: totalUnits,
        filtered_units: filteredUnits.length,
        filter_reasons: filterReasons,
      },
    };
  }

  /**
   * Build memory view from user's knowledge units
   */
  async buildViewFromUser(
    userId: string,
    contract: SensemakingContract,
    options: {
      limit?: number;
      referenceDate?: Date;
    } = {}
  ): Promise<MemoryView> {
    const limit = options.limit || 100;

    // Fetch knowledge units from database
    const { data: units, error } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Fetch more to account for filtering

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch knowledge units');
      throw error;
    }

    const knowledgeUnits = (units || []) as KnowledgeUnit[];

    // Build view
    return this.buildView(knowledgeUnits, contract, options);
  }

  /**
   * Build memory view from journal entries
   * 
   * Converts journal entries to knowledge units and applies contract
   */
  async buildViewFromEntries(
    userId: string,
    contract: SensemakingContract,
    options: {
      limit?: number;
      referenceDate?: Date;
      entryIds?: string[];
    } = {}
  ): Promise<MemoryView> {
    const limit = options.limit || 100;

    // If specific entry IDs provided, fetch those
    let query = supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (options.entryIds && options.entryIds.length > 0) {
      query = query.in('id', options.entryIds);
    } else {
      query = query.limit(limit * 2);
    }

    const { data: entries, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch journal entries');
      throw error;
    }

    // Get knowledge units for these entries
    const entryIds = (entries || []).map(e => e.id);
    if (entryIds.length === 0) {
      return {
        units: [],
        contract,
        metadata: {
          total_units: 0,
          filtered_units: 0,
          filter_reasons: [],
        },
      };
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('user_id', userId)
      .in('utterance_id', entryIds);

    if (unitsError) {
      logger.error({ error: unitsError, userId }, 'Failed to fetch knowledge units for entries');
      throw unitsError;
    }

    const knowledgeUnits = (units || []) as KnowledgeUnit[];

    // Build view
    return this.buildView(knowledgeUnits, contract, options);
  }

  /**
   * Build memory view with semantic search
   * 
   * Searches for relevant memories and applies contract filtering
   */
  async buildViewFromSearch(
    userId: string,
    query: string,
    contract: SensemakingContract,
    options: {
      limit?: number;
      referenceDate?: Date;
    } = {}
  ): Promise<MemoryView> {
    const limit = options.limit || 20;

    // Use semantic search to find relevant entries
    // This is a simplified version - in production, use your HQI service
    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit * 3); // Fetch more for filtering

    if (error) {
      logger.error({ error, userId }, 'Failed to search entries');
      throw error;
    }

    // Get knowledge units for these entries
    const entryIds = (entries || []).map(e => e.id);
    if (entryIds.length === 0) {
      return {
        units: [],
        contract,
        metadata: {
          total_units: 0,
          filtered_units: 0,
          filter_reasons: [],
        },
      };
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('user_id', userId)
      .in('utterance_id', entryIds);

    if (unitsError) {
      logger.error({ error: unitsError, userId }, 'Failed to fetch knowledge units for search');
      throw unitsError;
    }

    const knowledgeUnits = (units || []) as KnowledgeUnit[];

    // Build view
    return this.buildView(knowledgeUnits, contract, options);
  }

  /**
   * Get contract metadata for UI
   */
  getContractMetadata(contract: SensemakingContract): {
    name: string;
    description: string;
    capabilities: string[];
    limitations: string[];
  } {
    const capabilities: string[] = [];
    const limitations: string[] = [];

    // Capabilities based on allowed types
    if (contract.allowed_knowledge_types.includes('EXPERIENCE')) {
      capabilities.push('Can access your experiences');
    }
    if (contract.allowed_knowledge_types.includes('FEELING')) {
      capabilities.push('Can access your feelings');
    }
    if (contract.allowed_knowledge_types.includes('BELIEF')) {
      capabilities.push('Can access your beliefs');
    }
    if (contract.allowed_knowledge_types.includes('FACT')) {
      capabilities.push('Can access verified facts');
    }

    // Limitations based on disallowed types
    if (contract.disallowed_knowledge_types.includes('BELIEF')) {
      limitations.push('Cannot access beliefs');
    }
    if (contract.disallowed_knowledge_types.includes('FEELING')) {
      limitations.push('Cannot access feelings');
    }

    // Limitations based on promotion rules
    if (!contract.promotion_rules.allow_inference) {
      limitations.push('Cannot make inferences');
    }

    // Limitations based on output constraints
    if (!contract.output_constraints.must_cite_sources) {
      limitations.push('May not cite sources');
    }

    return {
      name: contract.name,
      description: contract.description,
      capabilities,
      limitations,
    };
  }
}

export const memoryViewBuilder = new MemoryViewBuilder();


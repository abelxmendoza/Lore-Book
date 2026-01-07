// =====================================================
// CONTRACT-AWARE MEMORY RETRIEVER
// Purpose: Memory retrieval that respects Sensemaking Contracts
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import type { KnowledgeUnit } from '../services/knowledgeTypeEngineService';
import type { SensemakingContract } from './sensemakingContract';
import { memoryViewBuilder } from './memoryViewBuilder';
import { contractResolver } from './contractResolver';

/**
 * Contract-aware memory retrieval result
 */
export interface ContractAwareMemoryResult {
  knowledge_units: KnowledgeUnit[];
  contract: SensemakingContract;
  metadata: {
    total_available: number;
    filtered_count: number;
    filter_reasons: string[];
  };
}

/**
 * Contract-Aware Memory Retriever
 * 
 * Retrieves memory through the lens of a Sensemaking Contract.
 * 
 * Architecture:
 * Memory Graph → Sensemaking Contract → Filtered, Typed, Safe View
 */
export class ContractAwareMemoryRetriever {
  /**
   * Retrieve memory with contract filtering
   */
  async retrieveWithContract(
    userId: string,
    contract: SensemakingContract,
    options: {
      limit?: number;
      query?: string;
      referenceDate?: Date;
    } = {}
  ): Promise<ContractAwareMemoryResult> {
    const limit = options.limit || 20;

    try {
      // Build memory view using contract
      let view;
      
      if (options.query) {
        // Semantic search with contract
        view = await memoryViewBuilder.buildViewFromSearch(
          userId,
          options.query,
          contract,
          { limit, referenceDate: options.referenceDate }
        );
      } else {
        // General retrieval with contract
        view = await memoryViewBuilder.buildViewFromUser(
          userId,
          contract,
          { limit, referenceDate: options.referenceDate }
        );
      }

      logger.debug(
        {
          userId,
          contractId: contract.id,
          totalUnits: view.metadata.total_units,
          filteredUnits: view.metadata.filtered_units,
        },
        'Retrieved memory with contract'
      );

      return {
        knowledge_units: view.units,
        contract: view.contract,
        metadata: {
          total_available: view.metadata.total_units,
          filtered_count: view.metadata.filtered_units,
          filter_reasons: view.metadata.filter_reasons,
        },
      };
    } catch (error) {
      logger.error({ error, userId, contractId: contract.id }, 'Failed to retrieve memory with contract');
      throw error;
    }
  }

  /**
   * Retrieve memory from journal entries with contract
   */
  async retrieveFromEntriesWithContract(
    userId: string,
    contract: SensemakingContract,
    entryIds: string[],
    options: {
      referenceDate?: Date;
    } = {}
  ): Promise<ContractAwareMemoryResult> {
    try {
      const view = await memoryViewBuilder.buildViewFromEntries(
        userId,
        contract,
        {
          entryIds,
          referenceDate: options.referenceDate,
        }
      );

      return {
        knowledge_units: view.units,
        contract: view.contract,
        metadata: {
          total_available: view.metadata.total_units,
          filtered_count: view.metadata.filtered_units,
          filter_reasons: view.metadata.filter_reasons,
        },
      };
    } catch (error) {
      logger.error({ error, userId, contractId: contract.id }, 'Failed to retrieve memory from entries with contract');
      throw error;
    }
  }

  /**
   * Check if a knowledge unit is accessible under a contract
   */
  isAccessible(unit: KnowledgeUnit, contract: SensemakingContract): boolean {
    const result = contractResolver.passesContract(unit, contract);
    return result.passes;
  }
}

export const contractAwareMemoryRetriever = new ContractAwareMemoryRetriever();


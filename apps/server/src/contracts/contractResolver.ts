// =====================================================
// CONTRACT RESOLVER
// Purpose: Resolve and apply contracts to memory access
// =====================================================

import { logger } from '../logger';
import type { KnowledgeType , KnowledgeUnit } from '../services/knowledgeTypeEngineService';

import { getContract, type SensemakingContract, type ContradictionPolicy } from './sensemakingContract';

/**
 * Contract resolution result
 */
export interface ContractResolution {
  contract: SensemakingContract;
  applied: boolean;
  reason?: string;
}

/**
 * Contract Resolver
 * 
 * Resolves contracts and applies them to memory access.
 */
export class ContractResolver {
  /**
   * Resolve contract by ID
   */
  resolveContract(contractId: string): ContractResolution {
    const contract = getContract(contractId);
    
    if (!contract) {
      logger.warn({ contractId }, 'Contract not found');
      return {
        contract: this.getDefaultContract(),
        applied: false,
        reason: `Contract ${contractId} not found, using default`,
      };
    }

    return {
      contract,
      applied: true,
    };
  }

  /**
   * Check if a knowledge unit passes contract filters
   */
  passesContract(
    unit: KnowledgeUnit,
    contract: SensemakingContract
  ): {
    passes: boolean;
    reason?: string;
  } {
    // Check knowledge type
    if (contract.disallowed_knowledge_types.includes(unit.knowledge_type)) {
      return {
        passes: false,
        reason: `Knowledge type ${unit.knowledge_type} is disallowed by contract`,
      };
    }

    if (!contract.allowed_knowledge_types.includes(unit.knowledge_type)) {
      return {
        passes: false,
        reason: `Knowledge type ${unit.knowledge_type} is not allowed by contract`,
      };
    }

    // Check confidence threshold
    if (unit.confidence < contract.min_confidence) {
      return {
        passes: false,
        reason: `Confidence ${unit.confidence} below minimum ${contract.min_confidence}`,
      };
    }

    return { passes: true };
  }

  /**
   * Apply contradiction policy to units
   */
  applyContradictionPolicy(
    units: KnowledgeUnit[],
    contract: SensemakingContract
  ): KnowledgeUnit[] {
    switch (contract.contradiction_policy) {
      case 'ALLOW_PARALLEL':
        // Keep all units, even if contradictory
        return units;

      case 'FILTER_UNSTABLE':
        // Filter out low-confidence contradictory units
        // This is a simplified version - in production, you'd detect actual contradictions
        return units.filter(unit => unit.confidence >= contract.min_confidence);

      case 'REQUIRE_RESOLUTION':
        // Only keep units that have been resolved
        // This would require checking resolution status in a real implementation
        return units.filter(unit => {
          // For now, assume high confidence means resolved
          // In production, check actual resolution status
          return unit.confidence >= 0.8;
        });

      default:
        return units;
    }
  }

  /**
   * Apply temporal scope filter
   */
  applyTemporalScope(
    units: KnowledgeUnit[],
    contract: SensemakingContract,
    referenceDate?: Date
  ): KnowledgeUnit[] {
    const refDate = referenceDate || new Date();

    switch (contract.temporal_scope) {
      case 'ALL_TIME':
        return units;

      case 'RECENT_ONLY':
        const windowDays = contract.temporal_window_days || 30;
        const cutoffDate = new Date(refDate);
        cutoffDate.setDate(cutoffDate.getDate() - windowDays);
        
        return units.filter(unit => {
          const unitDate = new Date(unit.created_at);
          return unitDate >= cutoffDate;
        });

      case 'EXPLICIT_RANGE':
        // For explicit range, we'd need start/end dates passed in
        // For now, return all (caller should handle this)
        return units;

      default:
        return units;
    }
  }

  /**
   * Filter knowledge units by contract
   */
  filterByContract(
    units: KnowledgeUnit[],
    contract: SensemakingContract,
    options: {
      referenceDate?: Date;
    } = {}
  ): KnowledgeUnit[] {
    // Step 1: Filter by knowledge type and confidence
    let filtered = units.filter(unit => {
      const result = this.passesContract(unit, contract);
      if (!result.passes) {
        logger.debug(
          { unitId: unit.id, reason: result.reason },
          'Unit filtered by contract'
        );
      }
      return result.passes;
    });

    // Step 2: Apply temporal scope
    filtered = this.applyTemporalScope(filtered, contract, options.referenceDate);

    // Step 3: Apply contradiction policy
    filtered = this.applyContradictionPolicy(filtered, contract);

    return filtered;
  }

  /**
   * Get default contract (Archivist)
   */
  private getDefaultContract(): SensemakingContract {
    const { ARCHIVIST_CONTRACT } = require('./sensemakingContract');
    return ARCHIVIST_CONTRACT;
  }
}

export const contractResolver = new ContractResolver();


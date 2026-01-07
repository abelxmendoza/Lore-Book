// =====================================================
// CONTRACT ENFORCER
// Purpose: The Gate - No system touches memory without passing through this
// =====================================================

import { logger } from '../logger';
import type { SensemakingContract, ContradictionPolicy } from './sensemakingContract';
import type { EntryIR, CanonStatus } from '../services/compiler/types';

/**
 * Constrained Memory View
 * 
 * The result of applying a contract to compiled entries.
 * Downstream systems only see this filtered view.
 */
export interface ConstrainedMemoryView {
  entries: EntryIR[];
  contract: SensemakingContract;
  metadata: {
    total_entries: number;
    filtered_entries: number;
    filter_reasons: string[];
  };
}

/**
 * Contract Enforcer
 * 
 * The gate that enforces how memory is allowed to be used.
 * 
 * Rule: No system touches memory without passing through this.
 * 
 * This layer sits between compiled memory (LNC) and anything that
 * reasons, reflects, analyzes, or advises.
 */
export class ContractEnforcer {
  /**
   * Apply contract to compiled entries
   * 
   * Filters entries based on:
   * - Allowed knowledge types
   * - Minimum confidence threshold
   * - Contradiction policy
   */
  apply(
    contract: SensemakingContract,
    entries: EntryIR[]
  ): ConstrainedMemoryView {
    const totalEntries = entries.length;
    const filterReasons: string[] = [];

    // Step 1: Filter by knowledge type, canon status, and confidence
    let filtered = entries.filter(entry => {
      // Check knowledge type
      if (!contract.allowed_knowledge_types.includes(entry.knowledge_type)) {
        return false;
      }

      // Check canon status (Phase 4)
      if (!contract.allowed_canon_statuses.includes(entry.canon_status)) {
        return false;
      }

      // Check confidence threshold
      if (entry.confidence < contract.min_confidence) {
        return false;
      }

      return true;
    });

    const typeConfidenceFiltered = totalEntries - filtered.length;
    if (typeConfidenceFiltered > 0) {
      filterReasons.push(`${typeConfidenceFiltered} entries filtered by knowledge type or confidence`);
    }

    // Step 2: Apply contradiction policy
    filtered = this.applyContradictionPolicy(filtered, contract);

    const finalFiltered = totalEntries - filtered.length;
    if (finalFiltered > typeConfidenceFiltered) {
      filterReasons.push(`${finalFiltered - typeConfidenceFiltered} entries filtered by contradiction policy`);
    }

    logger.debug(
      {
        contractId: contract.id,
        totalEntries,
        filteredEntries: filtered.length,
        filterReasons,
      },
      'Applied contract to entries'
    );

    return {
      entries: filtered,
      contract,
      metadata: {
        total_entries: totalEntries,
        filtered_entries: filtered.length,
        filter_reasons: filterReasons,
      },
    };
  }

  /**
   * Apply contradiction policy to entries
   */
  private applyContradictionPolicy(
    entries: EntryIR[],
    contract: SensemakingContract
  ): EntryIR[] {
    switch (contract.contradiction_policy) {
      case 'ALLOW_PARALLEL':
        // Keep all entries, even if contradictory
        return entries;

      case 'FILTER_UNSTABLE':
        // Filter out low-confidence entries (simplified - in production, detect actual contradictions)
        // This is a simplified version - in production, you'd detect actual contradictions
        return entries.filter(entry => entry.confidence >= contract.min_confidence);

      case 'REQUIRE_RESOLUTION':
        // Only keep entries that have been resolved
        // This would require checking resolution status in a real implementation
        // For now, assume high confidence means resolved
        return entries.filter(entry => entry.confidence >= 0.8);

      default:
        return entries;
    }
  }

  /**
   * Check if an entry passes the contract
   */
  passesContract(entry: EntryIR, contract: SensemakingContract): boolean {
    // Check knowledge type
    if (!contract.allowed_knowledge_types.includes(entry.knowledge_type)) {
      return false;
    }

    // Check canon status (Phase 4)
    if (!contract.allowed_canon_statuses.includes(entry.canon_status)) {
      return false;
    }

    // Check confidence
    if (entry.confidence < contract.min_confidence) {
      return false;
    }

    return true;
  }
}

export const contractEnforcer = new ContractEnforcer();


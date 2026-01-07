// =====================================================
// LOREKEEPER CORE BLUEPRINT
// Sensemaking Contract Layer (SCL) - Phase 3
// =====================================================

import { logger } from '../../logger';
import { epistemicLatticeService } from './epistemicLattice';
import type { EntryIR, KnowledgeType, CanonStatus } from './types';

export type InferenceLabel = 'INSIGHT' | 'REFLECTION' | 'INFERENCE' | 'NONE';

export interface InferencePolicy {
  allowed: boolean;
  label: InferenceLabel;
}

export interface OutputRequirements {
  mustLabelUncertainty: boolean;
}

export interface SensemakingContract {
  name: string;
  allowedKnowledgeTypes: KnowledgeType[];
  inferencePolicy: InferencePolicy;
  outputRequirements: OutputRequirements;
  minConfidence?: number;
}

export interface ConstrainedMemoryView {
  entries: EntryIR[];
  contract: SensemakingContract;
  metadata: {
    totalEntries: number;
    filteredEntries: number;
    excludedTypes: KnowledgeType[];
  };
}

/**
 * Predefined Contracts
 */
export const CONTRACTS = {
  /**
   * ARCHIVIST: Factual recall only, no interpretation
   * - Only EXPERIENCE and FACT entries
   * - No inference allowed
   * - Must label uncertainty
   */
  ARCHIVIST: {
    name: 'ARCHIVIST',
    allowedKnowledgeTypes: ['EXPERIENCE', 'FACT'] as KnowledgeType[],
    inferencePolicy: {
      allowed: false,
      label: 'NONE' as InferenceLabel,
    },
    outputRequirements: {
      mustLabelUncertainty: true,
    },
    minConfidence: 0.5,
  } as SensemakingContract,

  /**
   * ANALYST: Pattern detection and insights
   * - Only EXPERIENCE entries
   * - Inference allowed, labeled as INSIGHT
   * - Must label uncertainty
   */
  ANALYST: {
    name: 'ANALYST',
    allowedKnowledgeTypes: ['EXPERIENCE'] as KnowledgeType[],
    inferencePolicy: {
      allowed: true,
      label: 'INSIGHT' as InferenceLabel,
    },
    outputRequirements: {
      mustLabelUncertainty: true,
    },
    minConfidence: 0.6,
  } as SensemakingContract,

  /**
   * REFLECTOR: Emotional processing and reflection
   * - EXPERIENCE, FEELING, BELIEF entries
   * - Inference allowed, labeled as REFLECTION
   * - Must label uncertainty
   */
  REFLECTOR: {
    name: 'REFLECTOR',
    allowedKnowledgeTypes: ['EXPERIENCE', 'FEELING', 'BELIEF'] as KnowledgeType[],
    inferencePolicy: {
      allowed: true,
      label: 'REFLECTION' as InferenceLabel,
    },
    outputRequirements: {
      mustLabelUncertainty: true,
    },
  } as SensemakingContract,

  /**
   * THERAPIST: Emotional support and processing
   * - FEELING, BELIEF, EXPERIENCE entries
   * - Inference allowed, labeled as REFLECTION
   * - Must label uncertainty
   */
  THERAPIST: {
    name: 'THERAPIST',
    allowedKnowledgeTypes: ['FEELING', 'BELIEF', 'EXPERIENCE'] as KnowledgeType[],
    inferencePolicy: {
      allowed: true,
      label: 'REFLECTION' as InferenceLabel,
    },
    outputRequirements: {
      mustLabelUncertainty: true,
    },
  } as SensemakingContract,

  /**
   * STRATEGIST: Goal-oriented planning
   * - EXPERIENCE, DECISION, FACT entries
   * - Inference allowed, labeled as INSIGHT
   * - Must label uncertainty
   */
  STRATEGIST: {
    name: 'STRATEGIST',
    allowedKnowledgeTypes: ['EXPERIENCE', 'DECISION', 'FACT'] as KnowledgeType[],
    inferencePolicy: {
      allowed: true,
      label: 'INSIGHT' as InferenceLabel,
    },
    outputRequirements: {
      mustLabelUncertainty: true,
    },
    minConfidence: 0.5,
  } as SensemakingContract,
} as const;

export class ContractLayer {
  /**
   * Apply a contract to filter entries
   * Phase 3.5: Uses epistemic lattice service for invariant checking
   * Phase 3.6: Adds canon gating (reality boundary)
   */
  applyContract(contract: SensemakingContract, entries: EntryIR[]): ConstrainedMemoryView {
    const totalEntries = entries.length;
    const excludedTypes: KnowledgeType[] = [];

    // Filter by allowed knowledge types (invariant: no entry consumed without contract)
    // AND by canon status (Phase 3.6: reality boundary)
    let filtered = entries.filter(entry => {
      // Epistemic eligibility
      const epistemicallyAllowed = epistemicLatticeService.contractAllows(contract, entry);
      
      // Canon eligibility (Phase 3.6)
      const canonAllowed = this.canonAllowed(contract, entry);

      const allowed = epistemicallyAllowed && canonAllowed;
      
      if (!allowed && !excludedTypes.includes(entry.knowledge_type)) {
        excludedTypes.push(entry.knowledge_type);
      }
      return allowed;
    });

    // Filter by minimum confidence if specified
    if (contract.minConfidence !== undefined) {
      filtered = filtered.filter(entry => entry.confidence >= contract.minConfidence);
    }

    // Filter out deprecated entries
    filtered = filtered.filter(entry => !entry.compiler_flags.is_deprecated);

    const metadata = {
      totalEntries,
      filteredEntries: filtered.length,
      excludedTypes,
    };

    logger.debug(
      { contract: contract.name, totalEntries, filteredEntries: filtered.length, excludedTypes },
      'Applied contract to entries'
    );

    return {
      entries: filtered,
      contract,
      metadata,
    };
  }

  /**
   * Get contract by name
   */
  getContract(name: string): SensemakingContract | null {
    const contract = Object.values(CONTRACTS).find(c => c.name === name);
    return contract || null;
  }

  /**
   * Check if inference is allowed for a contract
   */
  isInferenceAllowed(contract: SensemakingContract): boolean {
    return contract.inferencePolicy.allowed;
  }

  /**
   * Get inference label for a contract
   */
  getInferenceLabel(contract: SensemakingContract): InferenceLabel {
    return contract.inferencePolicy.label;
  }

  /**
   * Check if uncertainty must be labeled
   */
  mustLabelUncertainty(contract: SensemakingContract): boolean {
    return contract.outputRequirements.mustLabelUncertainty;
  }

  /**
   * Format output with uncertainty labels if required
   */
  formatOutputWithUncertainty(
    contract: SensemakingContract,
    content: string,
    confidence: number
  ): string {
    if (!this.mustLabelUncertainty(contract)) {
      return content;
    }

    if (confidence < 0.5) {
      return `[UNCERTAIN] ${content}`;
    } else if (confidence < 0.7) {
      return `[TENTATIVE] ${content}`;
    }

    return content;
  }

  /**
   * Format inference with label if allowed
   */
  formatInference(
    contract: SensemakingContract,
    inference: string
  ): string {
    if (!this.isInferenceAllowed(contract)) {
      return inference; // Should not happen, but safe fallback
    }

    const label = this.getInferenceLabel(contract);
    return `[${label}] ${inference}`;
  }

  /**
   * Check if canon status is allowed for contract (Phase 3.6)
   * No bypass possible - canon gating is enforced
   */
  canonAllowed(contract: SensemakingContract, entry: EntryIR): boolean {
    const canonStatus = entry.canon.status;

    // ARCHIVIST & ANALYST: real life only
    if (contract.name === 'ARCHIVIST' || contract.name === 'ANALYST') {
      return canonStatus === 'CANON';
    }

    // REFLECTOR: allows internal exploration
    if (contract.name === 'REFLECTOR') {
      return ['CANON', 'HYPOTHETICAL', 'THOUGHT_EXPERIMENT'].includes(canonStatus);
    }

    // THERAPIST: allows CANON and HYPOTHETICAL (exploration)
    if (contract.name === 'THERAPIST') {
      return ['CANON', 'HYPOTHETICAL'].includes(canonStatus);
    }

    // STRATEGIST: real life only
    if (contract.name === 'STRATEGIST') {
      return canonStatus === 'CANON';
    }

    // Default: safest option (CANON only)
    return canonStatus === 'CANON';
  }
}

export const contractLayer = new ContractLayer();


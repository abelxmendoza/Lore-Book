// =====================================================
// SENSEMAKING CONTRACT LAYER (SCL)
// Phase 3: The Sensemaking Contract Layer
// 
// Core Principle: "No system may consume memory without 
// declaring how it interprets truth."
// =====================================================

import type { CanonStatus } from '../services/compiler/types';
import type { KnowledgeType } from '../services/knowledgeTypeEngineService';

/**
 * Contradiction handling policy
 */
export type ContradictionPolicy = 
  | 'ALLOW_PARALLEL'      // Keep all contradictions visible
  | 'FILTER_UNSTABLE'      // Filter out low-confidence contradictions
  | 'REQUIRE_RESOLUTION';   // Only show resolved contradictions


/**
 * Inference label for promoted knowledge
 */
export type InferenceLabel = 
  | 'REFLECTION'          // Narrative reflection
  | 'INSIGHT'             // Pattern observation
  | 'HYPOTHESIS';         // Tentative explanation

/**
 * Sensemaking Contract
 * 
 * A formal declaration of epistemic rules that govern
 * how a system may consume memory.
 * 
 * This is NOT configurable by LLMs.
 * It is owned by the system.
 * 
 * Core Principle: "No system may consume memory without 
 * declaring how it interprets truth."
 */
export interface SensemakingContract {
  id: string;
  name: string;
  description: string;

  /**
   * What kinds of knowledge this consumer is allowed to see
   */
  allowed_knowledge_types: KnowledgeType[];

  /**
   * What canon statuses this consumer is allowed to see (Phase 4)
   */
  allowed_canon_statuses: CanonStatus[];

  /**
   * Minimum confidence threshold (0.0 - 1.0)
   * Memories below this threshold are filtered out
   */
  min_confidence: number;

  /**
   * How contradictions are handled
   */
  contradiction_policy: ContradictionPolicy;

  /**
   * Whether inference is allowed
   */
  inference_policy: {
    allowed: boolean;
    inference_label?: InferenceLabel;
  };

  /**
   * Output obligations
   */
  output_requirements: {
    /**
     * Must label uncertainty in responses
     */
    must_label_uncertainty: boolean;
    
    /**
     * Must cite sources for claims
     */
    must_cite_sources: boolean;
    
    /**
     * Must surface contradictions explicitly
     */
    must_surface_contradictions: boolean;
  };
}

/**
 * Built-in Contracts
 * 
 * These are system-owned and cannot be modified by LLMs.
 */

/**
 * ARCHIVIST_CONTRACT
 * 
 * Purpose: Pure Recall
 * - Factual recall without interpretation
 * - No inference allowed
 * - All contradictions visible
 */
export const ARCHIVIST_CONTRACT: SensemakingContract = {
  id: 'ARCHIVIST',
  name: 'Archivist',
  description: 'Factual recall without interpretation',
  
  allowed_knowledge_types: ['EXPERIENCE', 'FACT'],
  
  min_confidence: 0.5,
  
  contradiction_policy: 'ALLOW_PARALLEL',
  
  inference_policy: {
    allowed: false,
  },
  
  output_requirements: {
    must_label_uncertainty: true,
    must_cite_sources: true,
    must_surface_contradictions: true,
  },
};

/**
 * ANALYST_CONTRACT
 * 
 * Purpose: Patterns, Not Opinions
 * - Pattern detection over experience
 * - Allows inference labeled as INSIGHT
 * - Filters unstable contradictions
 */
export const ANALYST_CONTRACT: SensemakingContract = {
  id: 'ANALYST',
  name: 'Analyst',
  description: 'Pattern detection over experience',
  
  allowed_knowledge_types: ['EXPERIENCE'],
  allowed_canon_statuses: ['CANON'],
  
  min_confidence: 0.6,
  
  contradiction_policy: 'FILTER_UNSTABLE',
  
  inference_policy: {
    allowed: true,
    inference_label: 'INSIGHT',
  },
  
  output_requirements: {
    must_label_uncertainty: true,
    must_cite_sources: true,
    must_surface_contradictions: false,
  },
};

/**
 * REFLECTOR_CONTRACT
 * 
 * Purpose: Identity Mirror
 * - Narrative reflection without claims
 * - Allows EXPERIENCE, FEELING, BELIEF
 * - Allows inference labeled as REFLECTION
 * - Shows parallel contradictions
 */
export const REFLECTOR_CONTRACT: SensemakingContract = {
  id: 'REFLECTOR',
  name: 'Reflector',
  description: 'Narrative reflection without claims',
  
  allowed_knowledge_types: ['EXPERIENCE', 'FEELING', 'BELIEF'],
  allowed_canon_statuses: ['CANON', 'HYPOTHETICAL', 'THOUGHT_EXPERIMENT'],
  
  min_confidence: 0.3,
  
  contradiction_policy: 'ALLOW_PARALLEL',
  
  inference_policy: {
    allowed: true,
    inference_label: 'REFLECTION',
  },
  
  output_requirements: {
    must_label_uncertainty: true,
    must_cite_sources: false,
    must_surface_contradictions: true,
  },
};

/**
 * Contract Registry
 * 
 * All available contracts in the system
 */
export const CONTRACT_REGISTRY: Record<string, SensemakingContract> = {
  ARCHIVIST: ARCHIVIST_CONTRACT,
  ANALYST: ANALYST_CONTRACT,
  REFLECTOR: REFLECTOR_CONTRACT,
};

/**
 * Get contract by ID
 */
export function getContract(contractId: string): SensemakingContract | null {
  return CONTRACT_REGISTRY[contractId] || null;
}

/**
 * Get all available contracts
 */
export function getAllContracts(): SensemakingContract[] {
  return Object.values(CONTRACT_REGISTRY);
}

/**
 * Validate contract configuration
 * 
 * Ensures contracts follow hard rules:
 * - min_confidence must be between 0 and 1
 * - inference_label required if inference allowed
 */
export function validateContract(contract: SensemakingContract): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Confidence must be valid
  if (contract.min_confidence < 0 || contract.min_confidence > 1) {
    errors.push('min_confidence must be between 0 and 1');
  }

  // If inference is allowed, label must be provided
  if (contract.inference_policy.allowed && !contract.inference_policy.inference_label) {
    errors.push('inference_label is required when inference is allowed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


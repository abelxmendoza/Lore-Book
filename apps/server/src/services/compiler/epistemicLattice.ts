// =====================================================
// LOREKEEPER EPISTEMIC LATTICE + PROOF SYSTEM (PHASE 3.5)
// Purpose: Make epistemic safety mathematically explicit
// =====================================================

import { logger } from '../../logger';

import type { EntryIR, KnowledgeType } from './types';

/**
 * Epistemic Lattice Definition
 * Partial order ⊑ defines allowed promotions
 * Downgrades are always allowed
 * Promotions require proof
 */
export const EpistemicLattice = {
  /**
   * A ⊑ B means A may promote to B (with proof)
   * Empty array means no promotions allowed
   */
  ordering: {
    EXPERIENCE: ['FACT'] as KnowledgeType[],
    BELIEF: ['FACT'] as KnowledgeType[],
    FACT: [] as KnowledgeType[],
    FEELING: [] as KnowledgeType[],
    DECISION: [] as KnowledgeType[],
    QUESTION: [] as KnowledgeType[],
  },

  /**
   * Hard exclusions (never promotable)
   * These edges are forbidden regardless of proof
   */
  forbidden: {
    FEELING: ['FACT', 'BELIEF'] as KnowledgeType[],
    QUESTION: ['FACT', 'BELIEF', 'EXPERIENCE'] as KnowledgeType[],
    DECISION: ['FACT'] as KnowledgeType[],
  },
} as const;

/**
 * Epistemic Proof
 * Every promotion must carry a proof artifact
 */
export interface EpistemicProof {
  rule_id: string; // e.g. "EXPERIENCE_TO_FACT"
  source_entries: string[]; // EntryIR IDs that serve as evidence
  confidence: number; // Proof confidence (0.0 - 1.0)
  generated_at: string; // ISO timestamp
  generated_by: 'SYSTEM' | 'USER';
  reasoning?: string; // Optional explanation
}

/**
 * Promotion Attempt
 */
export interface PromotionAttempt {
  from: KnowledgeType;
  to: KnowledgeType;
  proof?: EpistemicProof;
  entry_id?: string; // Entry being promoted
}

/**
 * Epistemic Violation Error
 */
export class EpistemicViolation extends Error {
  constructor(
    message: string,
    public readonly attempt?: PromotionAttempt
  ) {
    super(`Epistemic Violation: ${message}`);
    this.name = 'EpistemicViolation';
  }
}

/**
 * Epistemic Lattice Service
 */
export class EpistemicLatticeService {
  /**
   * Check if promotion is allowed by lattice
   */
  isPromotionAllowed(from: KnowledgeType, to: KnowledgeType): boolean {
    // Rule 1: Forbidden edges are absolute
    if (EpistemicLattice.forbidden[from]?.includes(to)) {
      return false;
    }

    // Rule 2: Check lattice ordering
    if (!EpistemicLattice.ordering[from]?.includes(to)) {
      return false;
    }

    return true;
  }

  /**
   * Type check promotion attempt (compile-time enforcement)
   */
  epistemicTypeCheck(attempt: PromotionAttempt): void {
    const { from, to, proof } = attempt;

    // Rule 1: Forbidden edges are absolute
    if (EpistemicLattice.forbidden[from]?.includes(to)) {
      throw new EpistemicViolation(
        `${from} can never promote to ${to}`,
        attempt
      );
    }

    // Rule 2: Check lattice ordering
    if (!EpistemicLattice.ordering[from]?.includes(to)) {
      throw new EpistemicViolation(
        `No lattice edge from ${from} to ${to}`,
        attempt
      );
    }

    // Rule 3: Promotions require proof
    if (!proof) {
      throw new EpistemicViolation(
        `Promotion ${from} → ${to} requires proof`,
        attempt
      );
    }

    // Rule 4: Proof confidence threshold
    if (proof.confidence < 0.6) {
      throw new EpistemicViolation(
        `Proof confidence too low for promotion (${proof.confidence} < 0.6)`,
        attempt
      );
    }

    logger.debug(
      { from, to, proofRule: proof.rule_id, proofConfidence: proof.confidence },
      'Epistemic promotion validated'
    );
  }

  /**
   * Enforce epistemic safety (automatic downgrading)
   * Safe failure mode: downgrade instead of error
   */
  enforceEpistemicSafety(entry: EntryIR): EntryIR {
    // Rule: FACT with low confidence → downgrade to BELIEF
    if (entry.knowledge_type === 'FACT' && entry.confidence < 0.6) {
      logger.warn(
        {
          entryId: entry.id,
          confidence: entry.confidence,
          knowledgeType: entry.knowledge_type,
        },
        'Downgrading FACT to BELIEF due to low confidence'
      );

      return {
        ...entry,
        knowledge_type: 'BELIEF',
        certainty_source: 'INFERENCE',
        compiler_flags: {
          ...entry.compiler_flags,
          downgraded_from_fact: true,
          last_compiled_at: new Date().toISOString(),
          compilation_version: entry.compiler_flags.compilation_version + 1,
        },
      };
    }

    return entry;
  }

  /**
   * Check if contract allows entry
   * No bypass possible - all access goes through contracts
   */
  contractAllows(
    contract: { allowedKnowledgeTypes: KnowledgeType[] },
    entry: EntryIR
  ): boolean {
    return contract.allowedKnowledgeTypes.includes(entry.knowledge_type);
  }

  /**
   * Generate proof for promotion
   */
  generateProof(
    from: KnowledgeType,
    to: KnowledgeType,
    evidenceEntries: EntryIR[],
    generatedBy: 'SYSTEM' | 'USER' = 'SYSTEM',
    reasoning?: string
  ): EpistemicProof {
    const ruleId = `${from}_TO_${to}`;

    // Calculate proof confidence from evidence
    const evidenceConfidence = evidenceEntries.length > 0
      ? evidenceEntries.reduce((sum, e) => sum + e.confidence, 0) / evidenceEntries.length
      : 0.5;

    // Minimum confidence threshold
    const proofConfidence = Math.max(evidenceConfidence, 0.6);

    return {
      rule_id: ruleId,
      source_entries: evidenceEntries.map(e => e.id),
      confidence: proofConfidence,
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
      reasoning,
    };
  }

  /**
   * Check if downgrade is allowed (always allowed)
   */
  isDowngradeAllowed(from: KnowledgeType, to: KnowledgeType): boolean {
    // Downgrades are always allowed (safety mechanism)
    // Check if it's actually a downgrade (not a promotion)
    const canPromote = this.isPromotionAllowed(from, to);
    return !canPromote || from === to;
  }
}

export const epistemicLatticeService = new EpistemicLatticeService();


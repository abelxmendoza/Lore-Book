// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Epistemic Type Checking - Validates entity usage
// =====================================================

import { logger } from '../../logger';
import { epistemicLatticeService } from './epistemicLattice';
import type { EntryIR, KnowledgeType } from './types';
import type { EntitySymbol } from './symbolTable';

export type TypeCheckResult = 
  | 'VALID'
  | 'VALID_WITH_RESTRICTIONS'
  | 'INVALID_LOW_CONFIDENCE'
  | 'INVALID_EPISTEMIC_MISMATCH';

export interface TypeCheckContext {
  result: TypeCheckResult;
  restrictions?: string[];
  warnings?: string[];
}

export class EpistemicTypeChecker {
  /**
   * Type check entity usage in an entry
   */
  typeCheckEntityUsage(entryIR: EntryIR, entitySymbol: EntitySymbol): TypeCheckContext {
    const knowledgeType = entryIR.knowledge_type;
    const restrictions: string[] = [];
    const warnings: string[] = [];

    switch (knowledgeType) {
      case 'EXPERIENCE':
        // OK to reference any entity
        return { result: 'VALID' };

      case 'FEELING':
        // Entities allowed, but no factual assertions
        restrictions.push('subjective_context');
        warnings.push('Entity referenced in feeling context - not a factual claim');
        return { result: 'VALID_WITH_RESTRICTIONS', restrictions, warnings };

      case 'BELIEF':
        // Must NOT promote to FACT
        restrictions.push('belief_context');
        warnings.push('Entity referenced in belief - do not treat as fact');
        return { result: 'VALID_WITH_RESTRICTIONS', restrictions, warnings };

      case 'FACT':
        // Must be verifiable or confidence-gated
        if (entitySymbol.confidence < 0.6) {
          return {
            result: 'INVALID_LOW_CONFIDENCE',
            warnings: [`Entity ${entitySymbol.canonical_name} has low confidence (${entitySymbol.confidence}) for FACT assertion`],
          };
        }
        return { result: 'VALID' };

      case 'QUESTION':
        // No assertions allowed
        restrictions.push('query_only');
        return { result: 'VALID_WITH_RESTRICTIONS', restrictions };

      case 'DECISION':
        // Entity used as context, not truth
        restrictions.push('decision_context');
        return { result: 'VALID_WITH_RESTRICTIONS', restrictions };

      default:
        return { result: 'VALID' };
    }
  }

  /**
   * Check if entry is eligible for recall
   */
  isRecallEligible(entryIR: EntryIR): boolean {
    return (
      (entryIR.knowledge_type === 'EXPERIENCE' || entryIR.knowledge_type === 'FACT') &&
      entryIR.confidence >= 0.5
    );
  }

  /**
   * Check if entry is eligible for pattern detection
   */
  isPatternEligible(entryIR: EntryIR): boolean {
    return (
      entryIR.knowledge_type === 'EXPERIENCE' &&
      entryIR.confidence >= 0.6
    );
  }

  /**
   * Check if entry is eligible for analytics
   */
  isAnalyticsEligible(entryIR: EntryIR): boolean {
    return entryIR.knowledge_type !== 'QUESTION';
  }

  /**
   * Downgrade assertion if confidence is too low
   * Phase 3.5: Uses epistemic lattice service for safety
   */
  downgradeAssertion(entryIR: EntryIR, entitySymbol: EntitySymbol): EntryIR {
    logger.warn(
      { entryId: entryIR.id, entityName: entitySymbol.canonical_name, confidence: entitySymbol.confidence },
      'Downgrading assertion due to low confidence'
    );

    // Use lattice service for safe downgrading
    const downgraded = epistemicLatticeService.enforceEpistemicSafety(entryIR);

    // If downgrade occurred, update confidence
    if (downgraded.knowledge_type !== entryIR.knowledge_type) {
      return {
        ...downgraded,
        confidence: Math.min(entryIR.confidence, entitySymbol.confidence),
      };
    }

    // Lower confidence without type change
    return {
      ...entryIR,
      confidence: Math.min(entryIR.confidence, entitySymbol.confidence * 0.8),
    };
  }
}

export const epistemicTypeChecker = new EpistemicTypeChecker();


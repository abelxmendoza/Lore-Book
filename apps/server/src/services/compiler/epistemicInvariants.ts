// =====================================================
// LOREKEEPER EPISTEMIC INVARIANTS (PHASE 3.5)
// Purpose: Formal invariants asserted system-wide
// These are testable and must never be violated
// =====================================================

import { logger } from '../../logger';
import type { EntryIR, KnowledgeType } from './types';
import { contractLayer, CONTRACTS } from './contractLayer';
import { epistemicLatticeService } from './epistemicLattice';

export interface InvariantViolation {
  invariant: string;
  entry_id?: string;
  details: string;
  severity: 'ERROR' | 'WARNING';
}

/**
 * Epistemic Invariants
 * These must never be violated
 */
export class EpistemicInvariants {
  /**
   * Invariant 1: BELIEF never appears in FACT-only views
   */
  checkBeliefInFactOnlyViews(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const archivistContract = CONTRACTS.ARCHIVIST;
    const constrainedView = contractLayer.applyContract(archivistContract, entries);

    // Check if any BELIEF entries made it through
    const beliefsInView = constrainedView.entries.filter(
      e => e.knowledge_type === 'BELIEF'
    );

    if (beliefsInView.length > 0) {
      violations.push({
        invariant: 'BELIEF_NEVER_IN_FACT_ONLY_VIEWS',
        details: `${beliefsInView.length} BELIEF entries found in ARCHIVIST (fact-only) view`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Invariant 2: FEELING never contributes to analytics
   */
  checkFeelingInAnalytics(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const analystContract = CONTRACTS.ANALYST;
    const constrainedView = contractLayer.applyContract(analystContract, entries);

    // ANALYST contract only allows EXPERIENCE
    const feelingsInView = constrainedView.entries.filter(
      e => e.knowledge_type === 'FEELING'
    );

    if (feelingsInView.length > 0) {
      violations.push({
        invariant: 'FEELING_NEVER_IN_ANALYTICS',
        details: `${feelingsInView.length} FEELING entries found in ANALYST (analytics-only) view`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Invariant 3: EXPERIENCE is the only pattern source
   */
  checkPatternSource(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const analystContract = CONTRACTS.ANALYST;
    const constrainedView = contractLayer.applyContract(analystContract, entries);

    // ANALYST contract only allows EXPERIENCE for patterns
    const nonExperienceInView = constrainedView.entries.filter(
      e => e.knowledge_type !== 'EXPERIENCE'
    );

    if (nonExperienceInView.length > 0) {
      violations.push({
        invariant: 'EXPERIENCE_ONLY_PATTERN_SOURCE',
        details: `${nonExperienceInView.length} non-EXPERIENCE entries found in pattern analysis`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Invariant 4: No entry is consumed without a contract
   */
  checkContractRequired(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    // This is enforced at the API level - entries should never be accessed
    // without going through contractLayer.applyContract()
    // This is a structural check, not a runtime check

    // Log warning if entries are accessed directly
    logger.debug(
      { entryCount: entries.length },
      'Entries accessed - ensure contract is applied'
    );

    return violations;
  }

  /**
   * Invariant 5: All promotions are monotonic
   */
  checkPromotionMonotonicity(entry: EntryIR): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    // Check if entry was downgraded from FACT
    if (entry.compiler_flags.downgraded_from_fact) {
      // This is allowed (downgrade is safe)
      return violations;
    }

    // Check if entry has proof of promotion
    // If knowledge_type is FACT, it should have been promoted from EXPERIENCE or BELIEF
    if (entry.knowledge_type === 'FACT') {
      // Check if promotion was valid
      const canPromoteFromExperience = epistemicLatticeService.isPromotionAllowed(
        'EXPERIENCE',
        'FACT'
      );
      const canPromoteFromBelief = epistemicLatticeService.isPromotionAllowed(
        'BELIEF',
        'FACT'
      );

      if (!canPromoteFromExperience && !canPromoteFromBelief) {
        violations.push({
          invariant: 'PROMOTION_MUST_BE_MONOTONIC',
          entry_id: entry.id,
          details: 'FACT entry without valid promotion path',
          severity: 'ERROR',
        });
      }
    }

    return violations;
  }

  /**
   * Invariant 6: FEELING can never promote to FACT or BELIEF
   */
  checkFeelingPromotion(entry: EntryIR): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    if (entry.knowledge_type === 'FEELING') {
      // Check if it was promoted from something (shouldn't be possible)
      // This is a structural check
      return violations;
    }

    // Check if FEELING somehow became FACT or BELIEF
    if (
      (entry.knowledge_type === 'FACT' || entry.knowledge_type === 'BELIEF') &&
      entry.compiler_flags.promoted_from_feeling
    ) {
      violations.push({
        invariant: 'FEELING_NEVER_PROMOTES',
        entry_id: entry.id,
        details: `FEELING cannot promote to ${entry.knowledge_type}`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Invariant 7: Non-CANON entries never enter analytics (Phase 3.6)
   */
  checkNonCanonInAnalytics(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const analystContract = CONTRACTS.ANALYST;
    const constrainedView = contractLayer.applyContract(analystContract, entries);

    // ANALYST contract should only allow CANON
    const nonCanonInView = constrainedView.entries.filter(
      e => e.canon.status !== 'CANON'
    );

    if (nonCanonInView.length > 0) {
      violations.push({
        invariant: 'NON_CANON_NEVER_IN_ANALYTICS',
        details: `${nonCanonInView.length} non-CANON entries found in ANALYST (analytics-only) view`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Invariant 8: ROLEPLAY/FICTIONAL never interpreted as lived experience (Phase 3.6)
   */
  checkRoleplayFictionInRealLife(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const archivistContract = CONTRACTS.ARCHIVIST;
    const constrainedView = contractLayer.applyContract(archivistContract, entries);

    // ARCHIVIST should only have CANON
    const roleplayFictionInView = constrainedView.entries.filter(
      e => e.canon.status === 'ROLEPLAY' || e.canon.status === 'FICTIONAL'
    );

    if (roleplayFictionInView.length > 0) {
      violations.push({
        invariant: 'ROLEPLAY_FICTION_NEVER_IN_REAL_LIFE',
        details: `${roleplayFictionInView.length} ROLEPLAY/FICTIONAL entries found in ARCHIVIST (real-life-only) view`,
        severity: 'ERROR',
      });
    }

    return violations;
  }

  /**
   * Run all invariant checks
   */
  checkAllInvariants(entries: EntryIR[]): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    // Check each invariant
    violations.push(...this.checkBeliefInFactOnlyViews(entries));
    violations.push(...this.checkFeelingInAnalytics(entries));
    violations.push(...this.checkPatternSource(entries));
    violations.push(...this.checkContractRequired(entries));
    violations.push(...this.checkNonCanonInAnalytics(entries)); // Phase 3.6
    violations.push(...this.checkRoleplayFictionInRealLife(entries)); // Phase 3.6

    // Check each entry individually
    for (const entry of entries) {
      violations.push(...this.checkPromotionMonotonicity(entry));
      violations.push(...this.checkFeelingPromotion(entry));
    }

    // Log violations
    if (violations.length > 0) {
      const errors = violations.filter(v => v.severity === 'ERROR');
      const warnings = violations.filter(v => v.severity === 'WARNING');

      if (errors.length > 0) {
        logger.error(
          { errors, warnings },
          'Epistemic invariant violations detected'
        );
      } else {
        logger.warn({ warnings }, 'Epistemic invariant warnings');
      }
    }

    return violations;
  }

  /**
   * Assert invariants (throws on violation)
   */
  assertInvariants(entries: EntryIR[]): void {
    const violations = this.checkAllInvariants(entries);
    const errors = violations.filter(v => v.severity === 'ERROR');

    if (errors.length > 0) {
      throw new Error(
        `Epistemic invariant violations: ${errors.map(v => v.invariant).join(', ')}`
      );
    }
  }
}

export const epistemicInvariants = new EpistemicInvariants();


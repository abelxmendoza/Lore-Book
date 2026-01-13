// =====================================================
// BELIEF ELIGIBILITY SERVICE
// Purpose: HARD SAFETY LOCK - Determines if a belief can be safely challenged
// 🔒 Nothing bypasses this file. If eligibility is false, do not generate a challenge.
// =====================================================

import { logger } from '../../../logger';
import type {
  BeliefChallengeEligibility,
  BeliefRiskLevel,
} from './types';

export type PerceptionForEligibility = {
  id: string;
  confidence_level: number;
  created_at: string;
  repetition_count?: number;
  content?: string;
};

export type SafetyContextForEligibility = {
  isIsolated: boolean;
  hasShame: boolean;
  hasDependencyFear: boolean;
  hasRelationalStrain?: boolean;
};

/**
 * HARD SAFETY LOCK: Determines if a belief can be safely challenged
 * 
 * Rules:
 * - Never challenge during shame + isolation
 * - Never challenge dependency fears
 * - Never challenge low-confidence beliefs (< 0.3)
 * - Never challenge beliefs less than 7 days old
 * 
 * @param perception The perception entry to evaluate
 * @param safetyContext Current user safety context
 * @returns Eligibility result with risk level
 */
export function isBeliefChallengeAllowed(
  perception: PerceptionForEligibility,
  safetyContext: SafetyContextForEligibility
): BeliefChallengeEligibility {
  // 🚫 Absolute blocks

  // Block 1: Shame + Isolation (highest risk)
  if (safetyContext.isIsolated && safetyContext.hasShame) {
    logger.debug(
      { perceptionId: perception.id, reason: 'shame + isolation' },
      'Belief challenge blocked: shame + isolation state'
    );
    return {
      eligible: false,
      reason: 'User currently in shame + isolation state',
      riskLevel: 'high',
    };
  }

  // Block 2: Dependency fear (high risk)
  if (safetyContext.hasDependencyFear) {
    logger.debug(
      { perceptionId: perception.id, reason: 'dependency fear' },
      'Belief challenge blocked: dependency fear present'
    );
    return {
      eligible: false,
      reason: 'Belief tied to dependency fear',
      riskLevel: 'high',
    };
  }

  // Block 3: Low confidence (epistemically fragile)
  if (perception.confidence_level < 0.3) {
    logger.debug(
      { perceptionId: perception.id, confidence: perception.confidence_level },
      'Belief challenge blocked: confidence too low'
    );
    return {
      eligible: false,
      reason: 'Belief confidence too low (epistemically fragile)',
      riskLevel: 'medium',
    };
  }

  // Block 4: Relational strain (medium risk - can be too destabilizing)
  if (safetyContext.hasRelationalStrain && perception.confidence_level < 0.5) {
    logger.debug(
      { perceptionId: perception.id, reason: 'relational strain + low confidence' },
      'Belief challenge blocked: relational strain with low confidence'
    );
    return {
      eligible: false,
      reason: 'Relational strain present with low confidence belief',
      riskLevel: 'medium',
    };
  }

  // ⏳ Age gate (default: 7 days)
  const ageDays =
    (Date.now() - new Date(perception.created_at).getTime()) /
    (1000 * 60 * 60 * 24);

  if (ageDays < 7) {
    logger.debug(
      { perceptionId: perception.id, ageDays: Math.round(ageDays * 10) / 10 },
      'Belief challenge blocked: belief too recent'
    );
    return {
      eligible: false,
      reason: 'Belief too recent to challenge',
      riskLevel: 'medium',
    };
  }

  // ✅ Allowed
  logger.debug(
    { perceptionId: perception.id, confidence: perception.confidence_level, ageDays: Math.round(ageDays * 10) / 10 },
    'Belief challenge allowed'
  );
  return {
    eligible: true,
    reason: 'Belief stable and safe to explore',
    riskLevel: 'low',
  };
}

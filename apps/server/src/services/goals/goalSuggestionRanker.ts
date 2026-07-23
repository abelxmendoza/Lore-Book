import type { GoalDecision, GoalEligibilityResult } from './goalTypes';

export function rankGoalSuggestion(
  confidence: number,
  eligibility: GoalEligibilityResult,
): GoalDecision {
  if (!eligibility.eligible) return 'REJECT';
  if (confidence >= 0.9) return 'ACCEPT';
  if (confidence >= 0.72) return 'REVIEW';
  return 'REJECT';
}

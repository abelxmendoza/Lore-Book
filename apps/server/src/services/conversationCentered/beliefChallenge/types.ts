// =====================================================
// BELIEF CHALLENGE TYPES
// Purpose: Type definitions for safe belief challenge system
// =====================================================

export type BeliefRiskLevel = 'low' | 'medium' | 'high';

export type BeliefChallengeEligibility = {
  eligible: boolean;
  reason: string;
  riskLevel: BeliefRiskLevel;
};

export type BeliefChallengeStyle = 'gentle' | 'curious' | 'reflective';

export type BeliefChallenge = {
  perceptionId: string;
  challengePrompt: string;
  style: BeliefChallengeStyle;
};

export type BeliefEvaluation = {
  repetitionCount: number;
  rewardCorrelation: number; // -1.0 to 1.0
  contradictingEvidenceCount: number;
};

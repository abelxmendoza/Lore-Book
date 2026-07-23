export type GoalKind =
  | 'QUEST' | 'PROJECT' | 'MILESTONE' | 'TASK' | 'HABIT' | 'ROUTINE'
  | 'INTENTION' | 'WISH' | 'HOPE' | 'AVOIDANCE_GOAL' | 'WAITING_STATE'
  | 'OBLIGATION' | 'IDEA' | 'COMPLETED_ACTION' | 'PAST_EVENT' | 'FEEDBACK'
  | 'HYPOTHETICAL' | 'NON_GOAL';

export type TemporalGoalState =
  | 'PAST_COMPLETED' | 'PAST_UNRESOLVED' | 'PRESENT_ACTIVE'
  | 'FUTURE_PLANNED' | 'FUTURE_POSSIBLE' | 'ONGOING' | 'TIME_UNKNOWN';

export type AgencyLevel = 'USER' | 'SHARED' | 'THIRD_PARTY' | 'NONE' | 'UNKNOWN';
export type GoalDurability = 'MOMENTARY' | 'SHORT_TERM' | 'DURABLE' | 'UNKNOWN';
export type GoalStatus =
  | 'CANDIDATE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  | 'BLOCKED' | 'WAITING' | 'HISTORICAL' | 'REJECTED';
export type GoalDecision =
  | 'ACCEPT' | 'REVIEW' | 'REJECT' | 'UPDATE_EXISTING'
  | 'COMPLETE_EXISTING' | 'CANCEL_EXISTING';
export type GoalDomain =
  | 'CAREER' | 'WORK' | 'PROJECT' | 'FINANCE' | 'HEALTH' | 'FITNESS'
  | 'EDUCATION' | 'RELATIONSHIP' | 'SOCIAL' | 'FAMILY' | 'CREATIVE'
  | 'TRAVEL' | 'PERSONAL_GROWTH' | 'OTHER';

export type GoalSourceType =
  | 'chat' | 'journal' | 'llm_scan' | 'social_import' | 'assistant'
  | 'system' | 'generated' | 'developer' | 'ui' | 'test';

export interface GoalEvidence {
  id?: string;
  text: string;
  sourceMessageId?: string;
  sourceType: GoalSourceType;
  observedAt: Date;
  stance: 'SUPPORTS' | 'CONTRADICTS' | 'COMPLETES' | 'CANCELS';
}

export interface GoalEligibilityResult {
  eligible: boolean;
  intendedByUser: boolean;
  futureOrOngoing: boolean;
  userHasAgency: boolean;
  unresolved: boolean;
  notNegated: boolean;
  notCompleted: boolean;
  sufficientlyDurable: boolean;
  semanticallyComplete: boolean;
  sourceAllowed: boolean;
  reasons: string[];
}

export interface GoalCandidate {
  id: string;
  ownerEntityId: string;
  kind: GoalKind;
  canonicalTitle: string;
  originalText: string;
  description?: string;
  status: GoalStatus;
  temporalState: TemporalGoalState;
  durability: GoalDurability;
  agency: AgencyLevel;
  domain: GoalDomain;
  targetEntityIds: string[];
  locationEntityIds: string[];
  organizationEntityIds: string[];
  desiredOutcome?: string;
  nextAction?: string;
  targetDate?: Date;
  recurrence?: string;
  commitmentScore: number;
  persistenceScore: number;
  actionabilityScore: number;
  salienceScore: number;
  confidence: number;
  evidenceIds: string[];
  supportingEvidence: GoalEvidence[];
  contradictingEvidence: GoalEvidence[];
  sourceMessageId: string;
  sourceType: GoalSourceType;
  createdAt: Date;
  lastSupportedAt: Date;
  lastContradictedAt?: Date;
}

export interface GoalCognitionInput {
  ownerEntityId: string;
  sourceText: string;
  proposedTitle?: string;
  proposedKind?: GoalKind | string;
  sourceMessageId?: string;
  sourceType?: GoalSourceType;
  authorRole?: 'user' | 'assistant' | 'system';
  userConfirmed?: boolean;
  now?: Date;
}

export interface ParsedClause {
  text: string;
  index: number;
}

export interface GoalMatchResult {
  candidateId: string;
  similarity: number;
  relationship: 'DUPLICATE' | 'PARENT' | 'CHILD' | 'RELATED';
}

export interface GoalDiagnosticTrace {
  sourceText: string;
  clauses: ParsedClause[];
  detectedIntent: string;
  temporalResolution: TemporalGoalState;
  negationScopes: string[];
  modality: string;
  agency: AgencyLevel;
  proposedKind: GoalKind;
  eligibility: GoalEligibilityResult;
  duplicateMatches: GoalMatchResult[];
  finalDecision: GoalDecision;
  reasons: string[];
}

export interface GoalCognitionResult {
  candidate: GoalCandidate;
  eligibility: GoalEligibilityResult;
  decision: GoalDecision;
  diagnostic: GoalDiagnosticTrace;
}

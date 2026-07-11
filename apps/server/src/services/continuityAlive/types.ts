/**
 * Continuity That Feels Alive — structured candidate model.
 * No parallel memory store; wraps existing evidence for selection + composition.
 */

export type ContinuityMemoryType =
  | 'entity'
  | 'event'
  | 'meaning'
  | 'claim'
  | 'relationship'
  | 'goal'
  | 'preference'
  | 'lesson'
  | 'plan'
  | 'correction';

export type ContinuityMode =
  | 'recall'
  | 'connection'
  | 'progress'
  | 'contrast'
  | 'unfinished_thread'
  | 'pattern'
  | 'goal_follow_up'
  | 'relationship_context'
  | 'none';

export type RecommendedUse =
  | 'direct_reference'
  | 'subtle_acknowledgment'
  | 'background_only'
  | 'ask_for_clarification'
  | 'do_not_use';

export type CorrectionState =
  | 'active'
  | 'user_corrected'
  | 'superseded'
  | 'contradicted'
  | 'historical_only';

export type SensitivityClass =
  | 'none'
  | 'dating'
  | 'sexual'
  | 'conflict'
  | 'rejection'
  | 'workplace_fear'
  | 'family'
  | 'health'
  | 'finances'
  | 'embarrassment';

export type EpistemicWeight =
  | 'user_correction'
  | 'newer_explicit'
  | 'repeated_supported'
  | 'older_explicit'
  | 'deterministic_inference'
  | 'weak_pattern';

export type RelevanceBreakdown = {
  entity: number;
  semantic: number;
  temporal: number;
  relationship: number;
  goal: number;
  causal: number;
  continuity: number;
  confidence: number;
  evidenceQuality: number;
  correctionPenalty: number;
  sensitivityPenalty: number;
  recency: number;
  repetition: number;
  /** Weighted composite used for ranking only — components remain explainable. */
  composite: number;
};

export type ContinuityCandidate = {
  memoryId: string;
  memoryType: ContinuityMemoryType;
  summary: string;
  entities: string[];
  eventTime: string | null;
  relationshipToCurrentMessage: string;
  evidenceIds: string[];
  confidence: number;
  epistemicType: string;
  correctionState: CorrectionState;
  sensitivity: SensitivityClass;
  relevanceBreakdown: RelevanceBreakdown;
  recommendedUse: RecommendedUse;
  continuityMode: ContinuityMode;
  epistemicWeight: EpistemicWeight;
  source?: string;
};

export type RejectedContinuityCandidate = ContinuityCandidate & {
  rejectReason:
    | 'low_relevance'
    | 'superseded'
    | 'contradicted'
    | 'too_sensitive'
    | 'duplicate'
    | 'weak_evidence'
    | 'wrong_entity'
    | 'temporally_irrelevant'
    | 'do_not_use'
    | 'over_budget'
    | 'diversity';
};

export type ContinuityTrace = {
  currentIntent: string;
  resolvedEntities: string[];
  candidatesRetrieved: ContinuityCandidate[];
  candidatesRejected: RejectedContinuityCandidate[];
  selectedContinuity: ContinuityCandidate[];
  relevanceBreakdown: Array<{
    memoryId: string;
    breakdown: RelevanceBreakdown;
    whySelected: string;
  }>;
  sensitivityDecision: Array<{ memoryId: string; sensitivity: SensitivityClass; allowed: boolean; reason: string }>;
  correctionChecks: Array<{ memoryId: string; correctionState: CorrectionState; action: string }>;
  promptTokensAdded: number;
  finalContinuityMode: ContinuityMode;
  compositionGuidance: string | null;
};

export type ContinuityMemoryInput = {
  memoryId: string;
  memoryType: ContinuityMemoryType;
  summary: string;
  entities?: string[];
  eventTime?: string | null;
  evidenceIds?: string[];
  confidence?: number;
  epistemicType?: string;
  correctionState?: CorrectionState;
  sensitivity?: SensitivityClass;
  source?: string;
  /** Optional free-text tags for matching (lessons, goals, etc.) */
  tags?: string[];
  /** If true, memory is from assistant generation — always penalized. */
  assistantGenerated?: boolean;
};

export type ContinuitySelectionInput = {
  currentMessage: string;
  memories: ContinuityMemoryInput[];
  resolvedEntities?: string[];
  /** ISO "now" for temporal scoring in fixtures */
  now?: string;
  maxSelect?: number;
  intentHint?: string;
};

export type ContinuitySelectionResult = {
  selected: ContinuityCandidate[];
  rejected: RejectedContinuityCandidate[];
  trace: ContinuityTrace;
  promptBlock: string | null;
};

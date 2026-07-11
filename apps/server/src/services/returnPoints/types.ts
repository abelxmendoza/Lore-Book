/**
 * Thread-Aware Progressive Continuity — return-point model.
 * Reuses existing evidence; no parallel task database.
 */

export type ReturnPointState =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type ReturnPointSourceType =
  | 'message'
  | 'goal'
  | 'meaning'
  | 'plan'
  | 'project'
  | 'quest'
  | 'event'
  | 'claim';

export type RecommendedSurface =
  | 'resume_prompt'
  | 'quiet_context'
  | 'chat_only'
  | 'do_not_surface';

export type ContinuityModeForReturn =
  | 'unfinished_thread'
  | 'goal_follow_up'
  | 'progress'
  | 'relationship_context'
  | 'recall'
  | 'none';

export type SensitivityClass =
  | 'none'
  | 'dating'
  | 'sexual'
  | 'rejection'
  | 'family'
  | 'health'
  | 'finances'
  | 'workplace_insecurity'
  | 'embarrassment'
  | 'conflict';

export type ReturnPointRelevance = {
  sameThread: number;
  recency: number;
  unresolved: number;
  importance: number;
  goalRelevance: number;
  confidence: number;
  repetitionPenalty: number;
  sensitivityPenalty: number;
  composite: number;
};

export type ReturnPoint = {
  id: string;
  sourceType: ReturnPointSourceType;
  sourceId: string;
  threadId?: string | null;
  title: string;
  summary: string;
  state: ReturnPointState;
  continuityMode: ContinuityModeForReturn;
  evidenceIds: string[];
  involvedEntities: string[];
  openedAt: string;
  lastUpdatedAt: string;
  confidence: number;
  sensitivity: SensitivityClass;
  resolutionSignals: string[];
  relevanceBreakdown: ReturnPointRelevance;
  recommendedSurface: RecommendedSurface;
  expirationReason?: string;
  /** Quiet one-line surface copy */
  surfaceLine: string;
  /** Raw evidence text used for detection */
  evidenceText: string;
};

export type InteractionRecord = {
  returnPointId: string;
  lastSurfacedAt?: string;
  surfaceCount: number;
  dismissCount: number;
  continuedCount: number;
  resolvedCount: number;
  lastAction?: 'continue' | 'dismiss' | 'resolve' | 'correct' | 'surface';
  lastActionAt?: string;
  /** User correction text if any */
  correctionNote?: string;
  /** Force state from user action */
  forcedState?: ReturnPointState;
};

export type EvidenceSnippet = {
  id: string;
  text: string;
  sourceType: ReturnPointSourceType;
  threadId?: string | null;
  entities?: string[];
  at: string;
  /** Goal status if from goals table */
  goalStatus?: 'active' | 'paused' | 'abandoned' | 'completed';
  /** Assistant-generated texts must not create open threads */
  fromAssistant?: boolean;
  sensitivity?: SensitivityClass;
  confidence?: number;
};

export type ReturnPointSelectionInput = {
  evidence: EvidenceSnippet[];
  interactions?: InteractionRecord[];
  /** Current thread when resuming */
  threadId?: string | null;
  /** Current page context (e.g. chat, lorebook) */
  contextHint?: string;
  now?: string;
  /** User explicitly opted into sensitive categories */
  allowSensitiveCategories?: SensitivityClass[];
  /** When true, same-thread resume allows quiet_context for some sensitive */
  resumingSameThread?: boolean;
};

export type RejectedReturnPoint = ReturnPoint & {
  rejectReason:
    | 'resolved'
    | 'superseded'
    | 'too_old'
    | 'too_sensitive'
    | 'weak_evidence'
    | 'already_dismissed'
    | 'low_relevance'
    | 'duplicate'
    | 'conditional_only'
    | 'assistant_suggestion'
    | 'repetition'
    | 'expired'
    | 'do_not_surface'
    | 'wrong_context';
};

export type ReturnPointTrace = {
  candidates: ReturnPoint[];
  selectedReturnPoint: ReturnPoint | null;
  rejectionReasons: Array<{ id: string; reason: string; title: string }>;
  unresolvedEvidence: string[];
  resolutionEvidence: string[];
  sensitivityDecision: Array<{ id: string; sensitivity: SensitivityClass; allowed: boolean }>;
  repetitionPenalty: Array<{ id: string; surfaceCount: number; dismissCount: number; penalty: number }>;
  finalSurfaceDecision: RecommendedSurface | 'none';
};

export type ReturnPointSelectionResult = {
  selected: ReturnPoint | null;
  rejected: RejectedReturnPoint[];
  trace: ReturnPointTrace;
};

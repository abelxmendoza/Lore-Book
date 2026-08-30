export type CognitiveStageName =
  | 'INGESTION'
  | 'SEMANTIC_EXTRACTION'
  | 'ENTITY_RESOLUTION'
  | 'EVENT_ASSEMBLY'
  | 'CANONICAL_STATE'
  | 'GOVERNANCE'
  | 'COGNITIVE_UPDATE'
  | 'ORCHESTRATION'
  | 'PROJECTION_UPDATE'
  // Response-generation reasoning core (Blueprint 21 Phase 1) — keyed by the
  // same chatMessageId as the ingestion stages above, so one trace answers
  // both "what we learned" and "how we reasoned about answering".
  | 'GOAL_TRACKING'
  | 'RETRIEVAL_AUDIT'
  | 'RESPONSE_PLANNING'
  // Blueprint 21 Phase 2
  | 'DISCOURSE_RESOLUTION'
  | 'MEMORY_TIER_GATE'
  | 'MILESTONE_DETECTION';

export type CognitiveStageStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export type CognitiveStageTrace = {
  stage: CognitiveStageName;
  status: CognitiveStageStatus;
  startedAt: string;
  durationMs: number;
  confidence?: number;
  counts: {
    inputs?: number;
    outputs?: number;
    discarded?: number;
    reused?: number;
    created?: number;
    updated?: number;
  };
  decisions: string[];
  downstreamEffects: string[];
  /** Structured, privacy-safe stage details; never raw prompts or message text. */
  details?: Record<string, unknown>;
  error?: string;
};

export type CognitiveObservatoryTrace = {
  id: string;
  version: 'cognitive-observatory-v1';
  userId: string;
  sourceId: string;
  startedAt: string;
  completedAt: string | null;
  status: CognitiveStageStatus;
  stages: CognitiveStageTrace[];
  totals: {
    durationMs: number;
    created: number;
    reused: number;
    updated: number;
    discarded: number;
  };
  projectionCoverage: Record<string, 'MEASURED' | 'NOT_WIRED'>;
  invariants: {
    containsRawMessageText: false;
    tenantScoped: true;
  };
};

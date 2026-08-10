export type CognitiveStageName =
  | 'INGESTION'
  | 'SEMANTIC_EXTRACTION'
  | 'ENTITY_RESOLUTION'
  | 'EVENT_ASSEMBLY'
  | 'CANONICAL_STATE'
  | 'GOVERNANCE'
  | 'COGNITIVE_UPDATE'
  | 'ORCHESTRATION'
  | 'PROJECTION_UPDATE';

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

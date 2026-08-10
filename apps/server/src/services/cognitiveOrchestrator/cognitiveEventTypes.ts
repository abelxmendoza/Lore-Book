import type {
  CognitiveChangeType,
  CognitiveDiff,
  ProjectionKind,
  ProjectionUpdateAction,
  UpdatePriority,
} from '../cognitiveUpdate';

export type CognitiveEventType =
  | 'EVIDENCE_ADDED'
  | 'ASSERTIONS_CREATED'
  | 'ASSERTION_SUPERSEDED'
  | 'RELATIONSHIP_CHANGED'
  | 'GOAL_COMPLETED'
  | 'GOAL_ABANDONED'
  | 'GOAL_REPRIORITIZED'
  | 'PROJECT_STARTED'
  | 'PROJECT_COMPLETED'
  | 'PROJECT_STATUS_CHANGED'
  | 'CURRENT_FOCUS_CHANGED'
  | 'LIFE_EVENT_DETECTED'
  | 'CAREER_MILESTONE'
  | 'CHAPTER_TRANSITION'
  | 'IDENTITY_THREAD_CHANGED'
  | 'TEMPORAL_CONFLICT_DETECTED'
  | 'RECURRING_PATTERN_CANDIDATE'
  | 'CONTRADICTION_DETECTED'
  | 'PROJECTION_MARKED_STALE';

export type CognitiveEvent = {
  id: string;
  version: 'cognitive-event-v1';
  type: CognitiveEventType;
  userId: string;
  sourceId: string;
  idempotencyKey: string;
  emittedAt: string;
  occurredAt?: string | null;
  evidenceIds: string[];
  changeTypes: CognitiveChangeType[];
  batchSize: number;
  requiresReview: boolean;
  payload: Record<string, unknown>;
};

export type CognitiveStepStatus =
  | 'PLANNED'
  | 'DEFERRED'
  | 'REVIEW_REQUIRED'
  | 'SKIPPED'
  | 'SUCCEEDED'
  | 'FAILED';

export type CognitiveExecutionStep = {
  id: string;
  projection: ProjectionKind;
  action: ProjectionUpdateAction;
  priority: UpdatePriority;
  status: CognitiveStepStatus;
  reason: string;
  eventIds: string[];
  dependsOnStepIds: string[];
  failurePolicy: 'ISOLATE';
};

export type CognitiveReviewReason =
  | 'SENSITIVE_RELATIONSHIP'
  | 'IDENTITY_CONTRADICTION'
  | 'CHAPTER_TRANSITION'
  | 'GOAL_STATE_CHANGE'
  | 'HEALTH_CONCLUSION'
  | 'PROJECTION_POLICY';

export type CognitiveReviewRoute = {
  reason: CognitiveReviewReason;
  eventIds: string[];
  projection?: ProjectionKind;
  summary: string;
};

export type CognitiveTraceEntry = {
  sequence: number;
  kind: 'EVENT' | 'PLAN' | 'REVIEW' | 'DEFERRED' | 'SKIPPED' | 'FAILURE' | 'COMPLETE';
  label: string;
  detail?: string;
};

export type CognitiveExecutionPlan = {
  id: string;
  version: 'cognitive-orchestrator-v1';
  mode: 'SHADOW';
  userId: string;
  sourceIds: string[];
  createdAt: string;
  idempotencyKey: string;
  events: CognitiveEvent[];
  steps: CognitiveExecutionStep[];
  reviewRoutes: CognitiveReviewRoute[];
  trace: CognitiveTraceEntry[];
  budget: {
    maxImmediateSteps: number;
    planned: number;
    deferred: number;
    reviewRequired: number;
  };
  duplicate: boolean;
  duplicateOf?: string;
  invariants: {
    canonicalStateMutated: false;
    subsystemInvokedAnotherSubsystem: false;
  };
};

export type CognitiveOrchestrationInput = {
  diff: CognitiveDiff;
  userId: string;
  sourceId: string;
  evidenceIds?: string[];
  assertionIds?: string[];
  occurredAt?: string | null;
  batchSize?: number;
  now?: string;
  maxImmediateSteps?: number;
};

export type CognitiveStepHandler = (
  step: CognitiveExecutionStep,
  plan: CognitiveExecutionPlan,
) => Promise<void> | void;

export type CognitiveExecutionResult = {
  planId: string;
  steps: CognitiveExecutionStep[];
  trace: CognitiveTraceEntry[];
  succeeded: number;
  failed: number;
  deferred: number;
  reviewRequired: number;
};

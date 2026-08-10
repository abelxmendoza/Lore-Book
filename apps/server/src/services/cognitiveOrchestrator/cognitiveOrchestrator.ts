import { createHash } from 'node:crypto';

import type { CognitiveChange, ProjectionKind } from '../cognitiveUpdate';

import {
  COGNITIVE_DEPENDENCY_REGISTRY,
  orderCognitiveProjections,
} from './cognitiveDependencyRegistry';
import type {
  CognitiveEvent,
  CognitiveEventType,
  CognitiveExecutionPlan,
  CognitiveExecutionResult,
  CognitiveExecutionStep,
  CognitiveOrchestrationInput,
  CognitiveReviewRoute,
  CognitiveStepHandler,
  CognitiveTraceEntry,
} from './cognitiveEventTypes';

const CHANGE_EVENT_TYPES: Record<CognitiveChange['type'], CognitiveEventType> = {
  IDENTITY_STRENGTHENED: 'IDENTITY_THREAD_CHANGED',
  IDENTITY_WEAKENED: 'IDENTITY_THREAD_CHANGED',
  RELATIONSHIP_CHANGED: 'RELATIONSHIP_CHANGED',
  GOAL_COMPLETED: 'GOAL_COMPLETED',
  GOAL_ABANDONED: 'GOAL_ABANDONED',
  GOAL_REPRIORITIZED: 'GOAL_REPRIORITIZED',
  PROJECT_STARTED: 'PROJECT_STARTED',
  PROJECT_COMPLETED: 'PROJECT_COMPLETED',
  PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
  CURRENT_FOCUS_CHANGED: 'CURRENT_FOCUS_CHANGED',
  LIFE_EVENT_DETECTED: 'LIFE_EVENT_DETECTED',
  CAREER_MILESTONE: 'CAREER_MILESTONE',
  CHAPTER_STARTED: 'CHAPTER_TRANSITION',
  CHAPTER_ENDED: 'CHAPTER_TRANSITION',
  RECURRING_PATTERN_CANDIDATE: 'RECURRING_PATTERN_CANDIDATE',
  TIMELINE_CORRECTION: 'TEMPORAL_CONFLICT_DETECTED',
  CONTRADICTION_DETECTED: 'CONTRADICTION_DETECTED',
};

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20)}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function eventFromChange(
  input: CognitiveOrchestrationInput,
  change: CognitiveChange,
  emittedAt: string,
): CognitiveEvent {
  const type = CHANGE_EVENT_TYPES[change.type];
  const identity = {
    userId: input.userId,
    sourceId: input.sourceId,
    type,
    changeType: change.type,
    evidenceIds: change.evidenceIds,
  };
  return {
    id: stableId('ce', identity),
    version: 'cognitive-event-v1',
    type,
    userId: input.userId,
    sourceId: input.sourceId,
    idempotencyKey: stableId('event', identity),
    emittedAt,
    occurredAt: input.occurredAt,
    evidenceIds: unique(change.evidenceIds),
    changeTypes: [change.type],
    batchSize: input.batchSize ?? 1,
    requiresReview: change.status === 'REVIEW_REQUIRED',
    payload: {
      domain: change.domain,
      summary: change.summary,
      confidence: change.confidence,
      status: change.status,
      previousStateRef: change.previousStateRef,
    },
  };
}

function baseEvents(input: CognitiveOrchestrationInput, emittedAt: string): CognitiveEvent[] {
  const evidenceIds = unique(input.evidenceIds?.length ? input.evidenceIds : [input.sourceId]);
  const evidenceIdentity = { userId: input.userId, sourceId: input.sourceId, type: 'EVIDENCE_ADDED' };
  const events: CognitiveEvent[] = [
    {
      id: stableId('ce', evidenceIdentity),
      version: 'cognitive-event-v1',
      type: 'EVIDENCE_ADDED',
      userId: input.userId,
      sourceId: input.sourceId,
      idempotencyKey: stableId('event', evidenceIdentity),
      emittedAt,
      occurredAt: input.occurredAt,
      evidenceIds,
      changeTypes: [],
      batchSize: input.batchSize ?? 1,
      requiresReview: false,
      payload: { cognitiveDiffId: input.diff.id, changed: input.diff.changed },
    },
  ];

  if (input.assertionIds?.length) {
    const assertionIdentity = {
      userId: input.userId,
      sourceId: input.sourceId,
      type: 'ASSERTIONS_CREATED',
      assertionIds: unique(input.assertionIds),
    };
    events.push({
      id: stableId('ce', assertionIdentity),
      version: 'cognitive-event-v1',
      type: 'ASSERTIONS_CREATED',
      userId: input.userId,
      sourceId: input.sourceId,
      idempotencyKey: stableId('event', assertionIdentity),
      emittedAt,
      occurredAt: input.occurredAt,
      evidenceIds,
      changeTypes: [],
      batchSize: input.batchSize ?? 1,
      requiresReview: false,
      payload: { assertionIds: unique(input.assertionIds) },
    });
  }
  return events;
}

export function coalesceCognitiveEvents(events: CognitiveEvent[]): CognitiveEvent[] {
  const groups = new Map<string, CognitiveEvent[]>();
  for (const event of events) {
    const key = `${event.userId}:${event.sourceId}:${event.type}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const first = group[0];
    const identity = {
      key: `${first.userId}:${first.sourceId}:${first.type}`,
      eventKeys: unique(group.map((event) => event.idempotencyKey)).sort(),
    };
    return {
      ...first,
      id: stableId('ce_batch', identity),
      idempotencyKey: stableId('event_batch', identity),
      evidenceIds: unique(group.flatMap((event) => event.evidenceIds)),
      changeTypes: unique(group.flatMap((event) => event.changeTypes)),
      batchSize: group.reduce((sum, event) => sum + event.batchSize, 0),
      requiresReview: group.some((event) => event.requiresReview),
      payload: {
        coalescedCount: group.length,
        items: group.map((event) => event.payload),
      },
    };
  });
}

function buildReviewRoutes(events: CognitiveEvent[], steps: CognitiveExecutionStep[]): CognitiveReviewRoute[] {
  const routes: CognitiveReviewRoute[] = [];
  const add = (route: CognitiveReviewRoute): void => {
    if (!routes.some((existing) => existing.reason === route.reason && existing.projection === route.projection)) {
      routes.push(route);
    }
  };

  for (const event of events) {
    if (event.type === 'RELATIONSHIP_CHANGED') {
      add({ reason: 'SENSITIVE_RELATIONSHIP', eventIds: [event.id], summary: 'Relationship state changes require review.' });
    }
    if (event.type === 'CONTRADICTION_DETECTED' || event.type === 'IDENTITY_THREAD_CHANGED' && event.requiresReview) {
      add({ reason: 'IDENTITY_CONTRADICTION', eventIds: [event.id], summary: 'Conflicting identity interpretations require review.' });
    }
    if (event.type === 'CHAPTER_TRANSITION') {
      add({ reason: 'CHAPTER_TRANSITION', eventIds: [event.id], summary: 'Large chapter transitions remain candidates until reviewed.' });
    }
    if (['GOAL_COMPLETED', 'GOAL_ABANDONED', 'GOAL_REPRIORITIZED'].includes(event.type) && event.requiresReview) {
      add({ reason: 'GOAL_STATE_CHANGE', eventIds: [event.id], summary: 'Goal state changes require confirmation.' });
    }
    if (event.payload.domain === 'health') {
      add({ reason: 'HEALTH_CONCLUSION', eventIds: [event.id], summary: 'Health conclusions always require review.' });
    }
  }

  for (const step of steps.filter((candidate) => candidate.status === 'REVIEW_REQUIRED')) {
    add({
      reason: 'PROJECTION_POLICY',
      eventIds: step.eventIds,
      projection: step.projection,
      summary: `${step.projection} is governed by review-before-canon policy.`,
    });
  }
  return routes;
}

export function buildCognitiveExecutionPlan(input: CognitiveOrchestrationInput): CognitiveExecutionPlan {
  const createdAt = input.now ?? input.diff.evaluatedAt;
  const rawEvents = [
    ...baseEvents(input, createdAt),
    ...input.diff.changes.map((change) => eventFromChange(input, change, createdAt)),
  ];
  const events = coalesceCognitiveEvents(rawEvents);
  const projections = orderCognitiveProjections(input.diff.impacts.map((impact) => impact.projection));
  const impactByProjection = new Map(input.diff.impacts.map((impact) => [impact.projection, impact]));
  const maxImmediateSteps = Math.max(0, input.maxImmediateSteps ?? 5);
  let immediateCount = 0;

  const steps = projections.map((projection): CognitiveExecutionStep => {
    const impact = impactByProjection.get(projection)!;
    const registry = COGNITIVE_DEPENDENCY_REGISTRY[projection];
    const review = impact.action === 'REVIEW_REQUIRED';
    const explicitlyDeferred = impact.priority === 'DEFERRED' || registry.execution === 'BACKGROUND';
    const overBudget = !review && !explicitlyDeferred && immediateCount >= maxImmediateSteps;
    if (!review && !explicitlyDeferred && !overBudget) immediateCount += 1;
    const status = review ? 'REVIEW_REQUIRED' : explicitlyDeferred || overBudget ? 'DEFERRED' : 'PLANNED';
    const eventIds = events
      .filter((event) => event.changeTypes.some((type) => impact.causedBy.includes(type)))
      .map((event) => event.id);
    return {
      id: stableId('step', { sourceId: input.sourceId, projection, action: impact.action }),
      projection,
      action: impact.action,
      priority: overBudget ? 'DEFERRED' : impact.priority,
      status,
      reason: overBudget ? `Immediate update budget of ${maxImmediateSteps} was exhausted.` : impact.reason,
      eventIds: eventIds.length ? eventIds : events.map((event) => event.id),
      dependsOnStepIds: registry.dependsOn
        .filter((dependency) => projections.includes(dependency))
        .map((dependency) => stableId('step', {
          sourceId: input.sourceId,
          projection: dependency,
          action: impactByProjection.get(dependency)?.action,
        })),
      failurePolicy: 'ISOLATE',
    };
  });

  const reviewRoutes = buildReviewRoutes(events, steps);
  const planIdentity = {
    version: 'cognitive-orchestrator-v1',
    userId: input.userId,
    sourceIds: [input.sourceId],
    eventKeys: events.map((event) => event.idempotencyKey).sort(),
    diffId: input.diff.id,
  };
  const id = stableId('cop', planIdentity);
  const trace: CognitiveTraceEntry[] = events.map((event, index) => ({
    sequence: index + 1,
    kind: 'EVENT',
    label: event.type,
    detail: `${event.evidenceIds.length} evidence reference(s)`,
  }));
  for (const step of steps) {
    trace.push({
      sequence: trace.length + 1,
      kind: step.status === 'DEFERRED' ? 'DEFERRED' : step.status === 'REVIEW_REQUIRED' ? 'REVIEW' : 'PLAN',
      label: `${step.action}:${step.projection}`,
      detail: step.reason,
    });
  }
  if (!input.diff.changed) {
    trace.push({ sequence: trace.length + 1, kind: 'SKIPPED', label: 'NO_COGNITIVE_CHANGE', detail: input.diff.noChangeReason });
  }

  return {
    id,
    version: 'cognitive-orchestrator-v1',
    mode: 'SHADOW',
    userId: input.userId,
    sourceIds: [input.sourceId],
    createdAt,
    idempotencyKey: stableId('plan', planIdentity),
    events,
    steps,
    reviewRoutes,
    trace,
    budget: {
      maxImmediateSteps,
      planned: steps.filter((step) => step.status === 'PLANNED').length,
      deferred: steps.filter((step) => step.status === 'DEFERRED').length,
      reviewRequired: steps.filter((step) => step.status === 'REVIEW_REQUIRED').length,
    },
    duplicate: false,
    invariants: {
      canonicalStateMutated: false,
      subsystemInvokedAnotherSubsystem: false,
    },
  };
}

export class CognitiveOrchestrator {
  private static readonly MAX_SEEN_PLANS = 5_000;
  private readonly seenPlans = new Map<string, string>();

  plan(input: CognitiveOrchestrationInput): CognitiveExecutionPlan {
    const plan = buildCognitiveExecutionPlan(input);
    const existing = this.seenPlans.get(plan.idempotencyKey);
    if (existing) {
      return {
        ...plan,
        duplicate: true,
        duplicateOf: existing,
        steps: plan.steps.map((step) => ({ ...step, status: 'SKIPPED' })),
        trace: [
          ...plan.trace,
          { sequence: plan.trace.length + 1, kind: 'SKIPPED', label: 'DUPLICATE_PLAN', detail: existing },
        ],
      };
    }
    this.seenPlans.set(plan.idempotencyKey, plan.id);
    if (this.seenPlans.size > CognitiveOrchestrator.MAX_SEEN_PLANS) {
      const oldest = this.seenPlans.keys().next().value;
      if (oldest) this.seenPlans.delete(oldest);
    }
    return plan;
  }

  clear(): void {
    this.seenPlans.clear();
  }
}

export async function executeCognitivePlan(
  plan: CognitiveExecutionPlan,
  handlers: Partial<Record<ProjectionKind, CognitiveStepHandler>>,
): Promise<CognitiveExecutionResult> {
  const steps = plan.steps.map((step) => ({ ...step }));
  const trace = [...plan.trace];
  for (const step of steps) {
    if (step.status !== 'PLANNED') continue;
    const handler = handlers[step.projection];
    if (!handler) {
      step.status = 'SKIPPED';
      trace.push({ sequence: trace.length + 1, kind: 'SKIPPED', label: step.projection, detail: 'No handler registered.' });
      continue;
    }
    try {
      await handler(step, plan);
      step.status = 'SUCCEEDED';
    } catch (error) {
      step.status = 'FAILED';
      trace.push({
        sequence: trace.length + 1,
        kind: 'FAILURE',
        label: step.projection,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  trace.push({ sequence: trace.length + 1, kind: 'COMPLETE', label: 'ORCHESTRATION_COMPLETE' });
  return {
    planId: plan.id,
    steps,
    trace,
    succeeded: steps.filter((step) => step.status === 'SUCCEEDED').length,
    failed: steps.filter((step) => step.status === 'FAILED').length,
    deferred: steps.filter((step) => step.status === 'DEFERRED').length,
    reviewRequired: steps.filter((step) => step.status === 'REVIEW_REQUIRED').length,
  };
}

export const cognitiveOrchestrator = new CognitiveOrchestrator();

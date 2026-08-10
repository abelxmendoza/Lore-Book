import { describe, expect, it, vi } from 'vitest';

import { evaluateCognitiveUpdate } from '../../src/services/cognitiveUpdate';
import {
  assertAcyclicCognitiveRegistry,
  buildCognitiveExecutionPlan,
  CognitiveOrchestrator,
  coalesceCognitiveEvents,
  executeCognitivePlan,
} from '../../src/services/cognitiveOrchestrator';
import type {
  CognitiveEvent,
} from '../../src/services/cognitiveOrchestrator';

const NOW = '2026-08-09T12:00:00.000Z';

function acceptedJobDiff() {
  return evaluateCognitiveUpdate({
    evidence: {
      evidenceId: 'message-1',
      userId: 'synthetic-user',
      content: 'I accepted the robotics offer today.',
      source: 'chat_message',
      authorRole: 'user',
      recordedAt: NOW,
    },
    previousState: {
      revision: 'state-1',
      currentChapter: { id: 'career-transition', domain: 'career', status: 'active' },
      activeGoals: [{ id: 'goal-job', title: 'Find a robotics job', status: 'active' }],
      identityThreads: [{ id: 'engineering', domain: 'career', strength: 0.72 }],
    },
    now: NOW,
  });
}

describe('CognitiveOrchestrator', () => {
  it('creates one deterministic, dependency-ordered plan for a meaningful message', () => {
    const diff = acceptedJobDiff();
    const plan = buildCognitiveExecutionPlan({
      diff,
      userId: 'synthetic-user',
      sourceId: 'message-1',
      evidenceIds: ['message-1'],
      assertionIds: ['assertion-1', 'assertion-2'],
      now: NOW,
    });

    expect(plan.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'EVIDENCE_ADDED',
      'ASSERTIONS_CREATED',
      'CAREER_MILESTONE',
      'CHAPTER_TRANSITION',
      'IDENTITY_THREAD_CHANGED',
      'GOAL_COMPLETED',
    ]));
    const order = plan.steps.map((step) => step.projection);
    expect(order.indexOf('canonical_timeline')).toBeLessThan(order.indexOf('narrative_ir'));
    expect(order.indexOf('narrative_ir')).toBeLessThan(order.indexOf('identity_snapshot'));
    expect(plan.invariants.canonicalStateMutated).toBe(false);
    expect(plan.invariants.subsystemInvokedAnotherSubsystem).toBe(false);

    const again = buildCognitiveExecutionPlan({
      diff,
      userId: 'synthetic-user',
      sourceId: 'message-1',
      assertionIds: ['assertion-1', 'assertion-2'],
      now: NOW,
    });
    expect(again.id).toBe(plan.id);
    expect(again.idempotencyKey).toBe(plan.idempotencyKey);
  });

  it('marks replayed plans as duplicates in one runtime', () => {
    const orchestrator = new CognitiveOrchestrator();
    const input = {
      diff: acceptedJobDiff(),
      userId: 'synthetic-user',
      sourceId: 'message-1',
      now: NOW,
    } as const;

    const first = orchestrator.plan(input);
    const second = orchestrator.plan(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.duplicateOf).toBe(first.id);
    expect(second.steps.every((step) => step.status === 'SKIPPED')).toBe(true);
  });

  it('coalesces repeated event types within a source batch', () => {
    const base: CognitiveEvent = {
      id: 'event-1',
      version: 'cognitive-event-v1',
      type: 'CHAPTER_TRANSITION',
      userId: 'synthetic-user',
      sourceId: 'import-1',
      idempotencyKey: 'key-1',
      emittedAt: NOW,
      evidenceIds: ['evidence-1'],
      changeTypes: ['CHAPTER_STARTED'],
      batchSize: 1,
      requiresReview: true,
      payload: { summary: 'Chapter started.' },
    };
    const events = coalesceCognitiveEvents([
      base,
      {
        ...base,
        id: 'event-2',
        idempotencyKey: 'key-2',
        evidenceIds: ['evidence-2'],
        changeTypes: ['CHAPTER_ENDED'],
        payload: { summary: 'Previous chapter ended.' },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].evidenceIds).toEqual(['evidence-1', 'evidence-2']);
    expect(events[0].changeTypes).toEqual(['CHAPTER_STARTED', 'CHAPTER_ENDED']);
    expect(events[0].payload.coalescedCount).toBe(2);
  });

  it('routes sensitive updates to review and defers background projections', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: {
        evidenceId: 'message-relationship',
        userId: 'synthetic-user',
        content: 'We broke up last night.',
        source: 'chat_message',
        authorRole: 'user',
        recordedAt: NOW,
      },
      now: NOW,
    });
    const plan = buildCognitiveExecutionPlan({
      diff,
      userId: 'synthetic-user',
      sourceId: 'message-relationship',
      now: NOW,
    });

    expect(plan.reviewRoutes.map((route) => route.reason)).toContain('SENSITIVE_RELATIONSHIP');
    expect(plan.steps.find((step) => step.projection === 'relationship_projection')?.status)
      .toBe('REVIEW_REQUIRED');
    expect(plan.steps.find((step) => step.projection === 'identity_snapshot')?.status)
      .toBe('DEFERRED');
  });

  it('enforces an immediate execution budget', () => {
    const plan = buildCognitiveExecutionPlan({
      diff: acceptedJobDiff(),
      userId: 'synthetic-user',
      sourceId: 'message-1',
      maxImmediateSteps: 1,
      now: NOW,
    });

    expect(plan.budget.planned).toBeLessThanOrEqual(1);
    expect(plan.budget.deferred).toBeGreaterThan(0);
    expect(plan.steps.some((step) => step.reason.includes('budget'))).toBe(true);
  });

  it('isolates a failed subsystem handler and continues independent work', async () => {
    const plan = buildCognitiveExecutionPlan({
      diff: acceptedJobDiff(),
      userId: 'synthetic-user',
      sourceId: 'message-1',
      maxImmediateSteps: 10,
      now: NOW,
    });
    const timeline = vi.fn(() => { throw new Error('timeline unavailable'); });
    const narrative = vi.fn();

    const result = await executeCognitivePlan(plan, {
      canonical_timeline: timeline,
      narrative_ir: narrative,
    });

    expect(timeline).toHaveBeenCalledOnce();
    expect(narrative).toHaveBeenCalledOnce();
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.trace.some((entry) => entry.kind === 'FAILURE')).toBe(true);
  });

  it('keeps ordinary conversation as evidence without scheduling projection work', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: {
        evidenceId: 'message-small-talk',
        userId: 'synthetic-user',
        content: 'The weather feels nice today.',
        source: 'chat_message',
        authorRole: 'user',
        recordedAt: NOW,
      },
      now: NOW,
    });
    const plan = buildCognitiveExecutionPlan({
      diff,
      userId: 'synthetic-user',
      sourceId: 'message-small-talk',
      now: NOW,
    });

    expect(plan.events.map((event) => event.type)).toEqual(['EVIDENCE_ADDED']);
    expect(plan.steps).toHaveLength(0);
    expect(plan.trace.some((entry) => entry.label === 'NO_COGNITIVE_CHANGE')).toBe(true);
  });

  it('keeps the declared dependency registry acyclic', () => {
    expect(() => assertAcyclicCognitiveRegistry()).not.toThrow();
  });
});

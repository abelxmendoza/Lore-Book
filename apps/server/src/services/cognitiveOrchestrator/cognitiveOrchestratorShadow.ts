import { logger } from '../../logger';
import type { CognitiveDiff, CognitiveEvidenceInput } from '../cognitiveUpdate';

import type { CognitiveExecutionPlan } from './cognitiveEventTypes';
import { cognitiveOrchestrator } from './cognitiveOrchestrator';

export function runCognitiveOrchestratorShadow(input: {
  evidence: CognitiveEvidenceInput;
  diff: CognitiveDiff;
}): CognitiveExecutionPlan {
  const plan = cognitiveOrchestrator.plan({
    diff: input.diff,
    userId: input.evidence.userId,
    sourceId: input.evidence.evidenceId,
    evidenceIds: [input.evidence.evidenceId],
    assertionIds: input.evidence.unitIds,
    occurredAt: input.evidence.occurredAt,
    batchSize: input.evidence.batchSize,
    now: input.diff.evaluatedAt,
  });

  logger.info({
    planId: plan.id,
    diffId: input.diff.id,
    userId: input.evidence.userId,
    sourceId: input.evidence.evidenceId,
    duplicate: plan.duplicate,
    events: plan.events.map((event) => event.type),
    steps: plan.steps.map((step) => ({
      projection: step.projection,
      action: step.action,
      status: step.status,
      priority: step.priority,
    })),
    reviewRoutes: plan.reviewRoutes.map((route) => route.reason),
    budget: plan.budget,
    mode: plan.mode,
  }, 'Cognitive orchestrator shadow plan');

  void import('../cognitiveObservatory').then(({ cognitiveObservatory }) => {
    cognitiveObservatory.recordStage({
      userId: input.evidence.userId,
      sourceId: input.evidence.evidenceId,
      trace: {
        stage: 'ORCHESTRATION',
        status: plan.duplicate ? 'SKIPPED' : 'PASS',
        startedAt: plan.createdAt,
        durationMs: 0,
        confidence: input.diff.confidence,
        counts: {
          inputs: plan.events.length,
          outputs: plan.steps.length,
          discarded: plan.duplicate ? plan.steps.length : 0,
          reused: plan.duplicate ? 1 : 0,
        },
        decisions: plan.steps.map((step) => `${step.status}:${step.projection}`),
        downstreamEffects: plan.reviewRoutes.map((route) => `REVIEW:${route.reason}`),
      },
    });
    cognitiveObservatory.complete(input.evidence.userId, input.evidence.evidenceId, plan.createdAt);
  }).catch(() => {});

  return plan;
}

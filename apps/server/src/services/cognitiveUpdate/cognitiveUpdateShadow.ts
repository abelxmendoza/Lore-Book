import { logger } from '../../logger';

import { evaluateCognitiveUpdate } from './cognitiveUpdateEngine';
import type { CognitiveDiff, CognitiveEvidenceInput } from './cognitiveUpdateTypes';

/**
 * Shadow adapter used by ingestion. It performs no reads and no writes; it
 * only emits a structured diff for evaluation and future queue integration.
 */
export function runCognitiveUpdateShadow(evidence: CognitiveEvidenceInput): CognitiveDiff {
  const startedAt = Date.now();
  const diff = evaluateCognitiveUpdate({ evidence });
  const diagnostic = {
    diffId: diff.id,
    evidenceId: evidence.evidenceId,
    userId: evidence.userId,
    changed: diff.changed,
    changeTypes: diff.changes.map((change) => change.type),
    affectedProjections: diff.impacts.map((impact) => ({
      projection: impact.projection,
      action: impact.action,
      priority: impact.priority,
    })),
    requiresReview: diff.requiresReview,
    mode: diff.mode,
  };

  if (diff.changed) logger.info(diagnostic, 'Cognitive update shadow diff');
  else logger.debug(diagnostic, 'Cognitive update shadow: no meaningful change');

  void import('../cognitiveObservatory').then(({ cognitiveObservatory }) => {
    cognitiveObservatory.recordStage({
      userId: evidence.userId,
      sourceId: evidence.evidenceId,
      trace: {
        stage: 'COGNITIVE_UPDATE',
        status: diff.changed ? 'PASS' : 'SKIPPED',
        startedAt: diff.evaluatedAt,
        durationMs: Date.now() - startedAt,
        confidence: diff.confidence,
        counts: { inputs: 1, outputs: diff.changes.length, discarded: 0 },
        decisions: diff.changes.map((change) => change.type),
        downstreamEffects: diff.impacts.map((impact) => `${impact.action}:${impact.projection}`),
      },
    });
  }).catch(() => {});

  // The orchestrator consumes the diff in parallel with the current procedural
  // runtime. It only plans and traces in shadow mode; no projection handler is
  // executed here and no canonical state is modified.
  void import('../cognitiveOrchestrator')
    .then(({ runCognitiveOrchestratorShadow }) => runCognitiveOrchestratorShadow({ evidence, diff }))
    .catch((err) => logger.debug({ err, userId: evidence.userId }, 'Cognitive orchestrator shadow skipped'));
  return diff;
}

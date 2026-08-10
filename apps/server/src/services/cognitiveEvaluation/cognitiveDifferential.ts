import type {
  CognitiveEvaluationDiff,
  CognitiveEvaluationManifest,
  CognitiveEvaluationOutput,
} from './cognitiveEvaluationTypes';
import { scoreCognitiveOutput } from './cognitiveScoring';

function setDiff(left: string[], right: string[]): { added: string[]; removed: string[] } {
  const before = new Set(left);
  const after = new Set(right);
  return {
    added: right.filter((value) => !before.has(value)),
    removed: left.filter((value) => !after.has(value)),
  };
}

export function compareCognitiveOutputs(
  manifest: CognitiveEvaluationManifest,
  baseline: CognitiveEvaluationOutput,
  candidate: CognitiveEvaluationOutput,
  regressionTolerance = 2,
): CognitiveEvaluationDiff {
  const baselineScores = new Map(scoreCognitiveOutput(manifest, baseline).map((entry) => [entry.metric, entry.score]));
  const candidateScores = scoreCognitiveOutput(manifest, candidate);
  const metricDeltas = candidateScores.map((entry) => {
    const baselineScore = baselineScores.get(entry.metric) ?? 0;
    const delta = entry.score - baselineScore;
    return {
      metric: entry.metric,
      baseline: baselineScore,
      candidate: entry.score,
      delta,
      regressed: delta < -regressionTolerance,
    };
  });
  const timelineBefore = baseline.timeline.map((item) => item.id);
  const timelineAfter = candidate.timeline.map((item) => item.id);
  const sharedBefore = timelineBefore.filter((id) => timelineAfter.includes(id));
  const sharedAfter = timelineAfter.filter((id) => timelineBefore.includes(id));

  return {
    scenarioId: manifest.id,
    metricDeltas,
    assertions: setDiff(baseline.assertions, candidate.assertions),
    contexts: setDiff(baseline.contexts, candidate.contexts),
    timeline: {
      ...setDiff(timelineBefore, timelineAfter),
      reordered: sharedBefore.join('|') !== sharedAfter.join('|'),
    },
    identityThreads: setDiff(baseline.identityThreads, candidate.identityThreads),
    recallChanged: baseline.recall !== candidate.recall,
    regressionCount: metricDeltas.filter((entry) => entry.regressed).length,
  };
}

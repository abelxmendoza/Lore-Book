import { createHash } from 'node:crypto';

import type {
  CognitiveEvaluationAdapter,
  CognitiveEvaluationManifest,
  CognitiveEvaluationRun,
  CognitiveEvaluationStatus,
  CognitiveScenarioResult,
} from './cognitiveEvaluationTypes';
import { evaluateCognitiveScenario } from './cognitiveScoring';

function runId(manifests: CognitiveEvaluationManifest[], startedAt: string): string {
  const digest = createHash('sha256')
    .update(`${startedAt}:${manifests.map((manifest) => `${manifest.id}:${manifest.version}`).join('|')}`)
    .digest('hex')
    .slice(0, 16);
  return `cog_eval_${digest}`;
}

function overallStatus(results: CognitiveScenarioResult[]): CognitiveEvaluationStatus {
  if (results.some((result) => result.status === 'FAIL')) return 'FAIL';
  if (results.some((result) => result.status === 'WARN')) return 'WARN';
  if (results.some((result) => result.status === 'PASS')) return 'PASS';
  return 'SKIPPED';
}

export async function runCognitiveEvaluationSuite(input: {
  manifests: CognitiveEvaluationManifest[];
  adapter: CognitiveEvaluationAdapter;
  now?: string;
}): Promise<CognitiveEvaluationRun> {
  const startedAt = input.now ?? new Date().toISOString();
  const scenarios: CognitiveScenarioResult[] = [];

  for (const manifest of input.manifests) {
    if (!manifest.synthetic) throw new Error(`Cognitive evaluation ${manifest.id} is not synthetic.`);
    const started = performance.now();
    const output = await input.adapter(manifest);
    scenarios.push(evaluateCognitiveScenario(manifest, output, Math.round(performance.now() - started)));
  }

  const completedAt = input.now ?? new Date().toISOString();
  const summary: Record<CognitiveEvaluationStatus, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIPPED: 0 };
  for (const scenario of scenarios) summary[scenario.status] += 1;
  return {
    runId: runId(input.manifests, startedAt),
    frameworkVersion: 'cognitive-evaluation-v1',
    startedAt,
    completedAt,
    status: overallStatus(scenarios),
    summary,
    averageScore: scenarios.length
      ? Math.round(scenarios.reduce((sum, scenario) => sum + scenario.overallScore, 0) / scenarios.length)
      : 0,
    scenarios,
    invariants: {
      syntheticOnly: true,
      externalWrites: false,
      privateUserDataRead: false,
    },
  };
}

export const baselineCognitiveAdapter: CognitiveEvaluationAdapter = (manifest) => manifest.baselineOutput;

import {
  baselineCognitiveAdapter,
  goldenCognitiveScenarios,
  runCognitiveEvaluationSuite,
} from '../services/cognitiveEvaluation';

async function main(): Promise<void> {
  const run = await runCognitiveEvaluationSuite({
    manifests: goldenCognitiveScenarios,
    adapter: baselineCognitiveAdapter,
  });

  for (const scenario of run.scenarios) {
    const scored = scenario.metrics
      .filter((metric) => metric.status !== 'SKIPPED')
      .map((metric) => `${metric.metric}=${metric.score}`)
      .join(' ');
    process.stdout.write(`${scenario.status} ${scenario.scenarioId} score=${scenario.overallScore} ${scored}\n`);
  }
  process.stdout.write(`${run.status} ${run.runId} average=${run.averageScore} PASS=${run.summary.PASS} WARN=${run.summary.WARN} FAIL=${run.summary.FAIL} SKIPPED=${run.summary.SKIPPED}\n`);

  if (run.status === 'FAIL') process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(`FAIL cognitive evaluation runner: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

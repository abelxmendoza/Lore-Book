import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runSuggestionQualityEval,
  summarizeReport,
} from '../services/lorebook/eval/suggestionEvalRunner';

async function main(): Promise<void> {
  const report = await runSuggestionQualityEval();
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '../../artifacts/suggestion-quality-eval.json');
  mkdirSync(dirname(outPath), { recursive: true });

  const json = {
    summary: {
      runId: report.runId,
      generatedAt: report.generatedAt,
      corpus: report.corpus,
      cleanupBurden: report.cleanupBurden,
      precisionRecall: report.precisionRecall,
      bookScorecard: report.bookScorecard,
      writeAmplification: report.writeAmplification,
      performance: report.performance,
      successTargets: report.successTargets,
      remainingCleanupSources: report.remainingCleanupSources,
      llmCalls: report.llmCalls,
      baseline: {
        kind: report.baseline.kind,
        label: report.baseline.label,
      },
    },
    phases: Object.fromEntries(
      Object.entries(report.phases).map(([id, phase]) => [
        id,
        {
          title: phase.title,
          candidates: phase.candidates,
          outcomes: phase.outcomes,
          cleanup: phase.cleanup,
          writes: phase.writes,
          performance: phase.performance,
        },
      ]),
    ),
    canonAfterIngest: report.canonAfterIngest,
    traces: Object.fromEntries(
      Object.entries(report.phases).map(([id, phase]) => [
        id,
        phase.traces.map((row) => ({
          candidateId: row.candidateId,
          name: row.name,
          book: row.book,
          outcome: row.outcome,
          expected: row.expected,
          matchedExpectation: row.matchedExpectation,
          reason: row.reason,
          cleanup: row.cleanup,
        })),
      ]),
    ),
  };

  writeFileSync(outPath, `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(`${summarizeReport(report)}\n`);
  process.stdout.write(`wrote ${outPath}\n`);

  const failed =
    report.successTargets.duplicateCanonicalCardsOnIdenticalRerun > 0 ||
    report.successTargets.dismissedEquivalentResurrection > 0 ||
    report.successTargets.repeatedMergeSuggestionsAfterConfirmedMerge > 0 ||
    report.successTargets.notSamePairReSuggested > 0 ||
    report.successTargets.machineCreateDuringFullDegraded > 0 ||
    report.performance.nPlusOneReintroduced;

  if (failed) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(
    `FAIL suggestion quality eval: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

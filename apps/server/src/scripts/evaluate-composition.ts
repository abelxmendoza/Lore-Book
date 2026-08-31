import { runCompositionBenchmark } from '../services/cognitiveEvaluation/compositionBenchmark';

const report = runCompositionBenchmark();
console.log(JSON.stringify(report, null, 2));

if (report.status === 'FAIL') {
  process.exitCode = 1;
}

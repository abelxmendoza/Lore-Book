import { runChatDiagnostics } from '../services/diagnostics/chatReliability/runner';

/* eslint-disable no-console */

function parseScenarioIds(argv: string[]): string[] | undefined {
  const arg = argv.find((item) => item.startsWith('--scenario=') || item.startsWith('--scenarios='));
  if (!arg) return undefined;
  const [, raw] = arg.split('=');
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function formatStatus(status: string): string {
  if (status === 'PASS') return 'PASS';
  if (status === 'WARN') return 'WARN';
  if (status === 'SKIPPED') return 'SKIP';
  return 'FAIL';
}

async function main(): Promise<void> {
  const result = await runChatDiagnostics({
    scenarioIds: parseScenarioIds(process.argv.slice(2)),
    includeSkipped: !process.argv.includes('--hide-skipped'),
  });

  console.log(`LoreBook Chat Reliability Diagnostics`);
  console.log(`runId: ${result.runId}`);
  console.log(`status: ${result.status} (${result.durationMs}ms)`);
  console.log(`summary: PASS=${result.summary.PASS} WARN=${result.summary.WARN} FAIL=${result.summary.FAIL} SKIPPED=${result.summary.SKIPPED}`);

  for (const warning of result.warnings) {
    console.log(`WARN: ${warning}`);
  }

  for (const scenario of result.scenarios) {
    console.log(`\n${scenario.id}: ${scenario.name}`);
    for (const phase of scenario.phases) {
      console.log(`${formatStatus(phase.status)} ${phase.name} — ${phase.actual}`);
    }
    console.log(`${scenario.status} — ${scenario.durationMs}ms`);
  }

  if (result.status === 'FAIL') {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

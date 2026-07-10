import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const { runChatDiagnostics } = await import('../src/services/diagnostics/chatReliability/runner');
  const result = await runChatDiagnostics({ includeSkipped: true, executeLive: true });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        status: result.status,
        durationMs: result.durationMs,
        syntheticUser: result.syntheticUser,
        summary: result.summary,
        warnings: result.warnings,
        scenarios: result.scenarios.map((s) => ({
          id: s.id,
          status: s.status,
          durationMs: s.durationMs,
          phases: s.phases.map((p) => ({
            id: p.stepId,
            status: p.status,
            actual: p.actual.slice(0, 160),
          })),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

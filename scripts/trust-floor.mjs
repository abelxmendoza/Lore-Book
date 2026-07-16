#!/usr/bin/env node
/**
 * Unified trust-floor release gate.
 * Combines entity integrity + chat durability + ingestion idempotency suites.
 *
 * Usage: npm run test:trust-floor
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'apps/server');
const webDir = join(root, 'apps/web');

const serverTests = [
  'tests/services/ingestion/ingestionJobStates.test.ts',
  'tests/services/ingestion/ingestionJobStore.test.ts',
  'tests/services/ingestion/ingestionJobStore.stateMachine.test.ts',
  'tests/services/ingestion/enqueueDurable.recovery.test.ts',
  'tests/services/ingestion/artifactIdempotency.replay.test.ts',
  'tests/services/ingestion/ingestionQueueSerialization.test.ts',
  'tests/services/chat/durabilityApiContract.test.ts',
  'tests/services/chat/chatDurability.integration.test.ts',
  'tests/services/chat/storyIngestionSolHomonym.regression.test.ts',
  'tests/services/chat/providerPressurePolicy.test.ts',
  'tests/services/chat/faultInjection.productionGuard.test.ts',
  'tests/services/events/eventSourceIdentity.test.ts',
  'tests/services/memoryQuality/memoryQuality.test.ts',
  'tests/services/memoryQuality/meaningArtifactIdentity.idempotency.test.ts',
  'tests/invariants/coreInvariants.test.ts',
  'tests/tenantIsolation.test.ts',
].join(' ');

const webTests = [
  'src/features/chat/hooks/__tests__/friendlyErrorMessage.durability.test.ts',
  'src/features/chat/hooks/__tests__/useChat.durability.test.tsx',
  'src/features/chat/hooks/__tests__/useChat.solHomonymRecovery.test.tsx',
].join(' ');

function run(cwd, cmd) {
  console.log(`\n▶ ${cmd}\n  (cwd: ${cwd})\n`);
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, DURABILITY_FAULT_INJECTION: 'true' },
  });
  return r.status ?? 1;
}

let failed = 0;
failed += run(serverDir, `npx vitest run ${serverTests}`) === 0 ? 0 : 1;
failed += run(webDir, `npx vitest run ${webTests}`) === 0 ? 0 : 1;

if (failed > 0) {
  console.error('\n❌ trust-floor FAILED\n');
  process.exit(1);
}
console.log('\n✅ trust-floor PASSED\n');
process.exit(0);

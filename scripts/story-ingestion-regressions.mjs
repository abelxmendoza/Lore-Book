#!/usr/bin/env node
/**
 * Focused story-ingestion regression gate for the Sol-homonym / durability fixture.
 *
 * Usage: npm run test:story-ingestion-regressions
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'apps/server');
const webDir = join(root, 'apps/web');

const serverTests = [
  'tests/services/chat/storyIngestionSolHomonym.regression.test.ts',
  'tests/services/chat/durabilityApiContract.test.ts',
  'src/services/conversationCentered/datingEligibility.test.ts',
].join(' ');

const webTests = [
  'src/features/chat/hooks/__tests__/useChat.solHomonymRecovery.test.tsx',
  'src/features/chat/hooks/__tests__/friendlyErrorMessage.durability.test.ts',
  'src/features/chat/hooks/__tests__/useChat.durability.test.tsx',
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
  console.error('\n❌ story-ingestion-regressions FAILED\n');
  process.exit(1);
}
console.log('\n✅ story-ingestion-regressions PASSED\n');
process.exit(0);

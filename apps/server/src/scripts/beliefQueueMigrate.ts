#!/usr/bin/env tsx
/**
 * Belief Queue Audit & Migration v2
 *
 * Default is dry-run (audit only).
 *
 * Usage:
 *   npm run beliefs:audit -- --user-id <uuid>
 *   npm run beliefs:migrate -- --user-id <uuid> --execute
 *   npm run beliefs:migrate -- --user-id <uuid> --rollback
 *
 * Env:
 *   TARGET_USER_ID / BELIEF_MIGRATION_USER_ID
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import {
  executeBeliefQueueMigration,
  rollbackBeliefQueueMigration,
} from '../services/beliefs/migration';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const execute = process.argv.includes('--execute') || process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  const userId =
    argValue('--user-id')
    || process.env.BELIEF_MIGRATION_USER_ID
    || process.env.TARGET_USER_ID
    || '';

  if (!userId) {
    console.error('Required: --user-id <uuid> or BELIEF_MIGRATION_USER_ID / TARGET_USER_ID');
    process.exit(1);
  }

  if (rollback) {
    const results = await rollbackBeliefQueueMigration(userId);
    const restored = results.filter((r) => r.status === 'restored').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Rollback complete: ${restored} restored, ${failed} failed, ${results.length} examined`);
    for (const row of results.filter((r) => r.status !== 'skipped')) {
      console.log(`  ${row.status}: ${row.proposalId}${row.detail ? ` (${row.detail})` : ''}`);
    }
    return;
  }

  const artifactsDir = path.resolve(__dirname, '../../../../artifacts');
  const { summary, applied, artifacts } = await executeBeliefQueueMigration(userId, {
    apply: execute,
    artifactsDir,
  });

  console.log(execute ? 'Belief migration applied' : 'Belief queue audit (dry-run)');
  console.log(`  total: ${summary.total ?? 0}`);
  console.log(`  applied updates: ${applied}`);
  for (const [key, value] of Object.entries(summary).sort()) {
    if (key === 'total') continue;
    console.log(`  ${key}: ${value}`);
  }
  console.log(`  artifacts: ${artifacts.jsonPath}`);
  console.log(`  artifacts: ${artifacts.mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Place Ontology Repair & Migration v1
 *
 * Default is dry-run (audit only).
 *
 * Usage:
 *   npm run places:audit -- --user-id <uuid>
 *   npm run places:migrate -- --user-id <uuid> --execute
 *   npm run places:migrate -- --user-id <uuid> --rollback
 *
 * Env:
 *   TARGET_USER_ID / PLACE_MIGRATION_USER_ID
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import {
  executePlaceOntologyMigration,
  formatMigrationReportMarkdown,
  rollbackPlaceOntologyMigration,
  writeMigrationArtifacts,
} from '../services/place/migration';

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
    || process.env.PLACE_MIGRATION_USER_ID
    || process.env.TARGET_USER_ID
    || '';

  if (!userId) {
    console.error('Required: --user-id <uuid> or PLACE_MIGRATION_USER_ID / TARGET_USER_ID');
    process.exit(1);
  }

  if (rollback) {
    const results = await rollbackPlaceOntologyMigration(userId);
    const restored = results.filter((r) => r.status === 'restored').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Rollback complete: ${restored} restored, ${failed} failed, ${results.length} examined`);
    for (const row of results.filter((r) => r.status !== 'skipped')) {
      console.log(`  ${row.status}: ${row.placeId}${row.detail ? ` (${row.detail})` : ''}`);
    }
    return;
  }

  const { summary, results } = await executePlaceOntologyMigration(userId, { apply: execute });
  const artifactsDir = path.resolve(__dirname, '../../../../artifacts');
  const { jsonPath, mdPath } = await writeMigrationArtifacts(summary, artifactsDir);

  console.log(execute ? 'APPLY mode' : 'DRY-RUN (default)');
  console.log(`Records: ${summary.totalRecords}`);
  console.log(`Keep/retype/rename: ${summary.keepCount}`);
  console.log(`Move/demote: ${summary.moveCount}`);
  console.log(`Archive/split: ${summary.archiveCount}`);
  console.log(`Needs review: ${summary.reviewCount}`);
  console.log('');
  console.log(formatMigrationReportMarkdown(summary).split('\n').slice(0, 40).join('\n'));
  console.log('');
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  if (execute) {
    const applied = results.filter((r) => r.status === 'applied').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Applied ${applied}; failed ${failed}`);
    for (const row of results.filter((r) => r.status === 'failed')) {
      console.log(`  FAIL ${row.placeId} ${row.decision}: ${row.detail}`);
    }
  } else {
    console.log('\nPass --execute to apply (soft-archive / retype; no hard deletes).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

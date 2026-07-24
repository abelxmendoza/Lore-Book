#!/usr/bin/env tsx
/**
 * Skills Book Cognition Audit & Migration v1
 *
 * Default is dry-run (audit only).
 *
 * Usage:
 *   npm run skills:audit -- --user-id <uuid>
 *   npm run skills:migrate -- --user-id <uuid> --execute
 *   npm run skills:migrate -- --user-id <uuid> --rollback
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import {
  executeSkillOntologyMigration,
  formatSkillAuditMarkdown,
  rollbackSkillOntologyMigration,
  writeSkillMigrationArtifacts,
} from '../services/skills/migration';

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
    || process.env.SKILL_MIGRATION_USER_ID
    || process.env.TARGET_USER_ID
    || '';

  if (!userId) {
    console.error('Required: --user-id <uuid> or SKILL_MIGRATION_USER_ID / TARGET_USER_ID');
    process.exit(1);
  }

  if (rollback) {
    const results = await rollbackSkillOntologyMigration(userId);
    const restored = results.filter((r) => r.status === 'restored').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Rollback complete: ${restored} restored, ${failed} failed, ${results.length} examined`);
    for (const row of results.filter((r) => r.status !== 'skipped')) {
      console.log(`  ${row.status}: ${row.skillId}${row.detail ? ` (${row.detail})` : ''}`);
    }
    return;
  }

  const { summary, results } = await executeSkillOntologyMigration(userId, { apply: execute });
  const artifactsDir = path.resolve(__dirname, '../../../../artifacts');
  const { jsonPath, mdPath } = await writeSkillMigrationArtifacts(summary, artifactsDir);

  console.log(execute ? 'APPLY mode' : 'DRY-RUN (default)');
  console.log(`Records: ${summary.totalRecords}`);
  console.log(`Keep/rename: ${summary.keepCount}`);
  console.log(`Merge: ${summary.mergeCount}`);
  console.log(`Retype/demote: ${summary.retypeCount}`);
  console.log(`Archive: ${summary.archiveCount}`);
  console.log(`Needs review: ${summary.reviewCount}`);
  console.log('');
  console.log(formatSkillAuditMarkdown(summary).split('\n').slice(0, 50).join('\n'));
  console.log('');
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  if (execute) {
    const applied = results.filter((r) => r.status === 'applied').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Applied ${applied}; failed ${failed}`);
    for (const row of results.filter((r) => r.status === 'failed')) {
      console.log(`  FAIL ${row.skillId} ${row.decision}: ${row.detail}`);
    }
  } else {
    console.log('\nPass --execute to apply (soft archive/retype/rename; no hard deletes).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

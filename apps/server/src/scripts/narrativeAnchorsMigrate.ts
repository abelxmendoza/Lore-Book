#!/usr/bin/env tsx
/**
 * Narrative Anchor Cognition Audit & Migration v1
 *
 * Default is dry-run.
 *
 *   npm run anchors:audit -- --user-id <uuid>
 *   npm run anchors:migrate -- --user-id <uuid> --execute
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../../.env') });

import {
  executeNarrativeAnchorMigration,
  formatNarrativeAnchorAuditMarkdown,
  writeNarrativeAnchorMigrationArtifacts,
} from '../services/narrativeAnchors/migration';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const execute = process.argv.includes('--execute') || process.argv.includes('--apply');
  const userId =
    argValue('--user-id')
    || process.env.ANCHOR_MIGRATION_USER_ID
    || process.env.TARGET_USER_ID
    || process.env.ADMIN_USER_ID
    || '';

  if (!userId) {
    console.error('Required: --user-id <uuid>');
    process.exit(1);
  }

  const { summary, results } = await executeNarrativeAnchorMigration(userId, { apply: execute });
  const artifactsDir = path.resolve(__dirname, '../../../../artifacts');
  const { jsonPath, mdPath } = await writeNarrativeAnchorMigrationArtifacts(summary, artifactsDir);

  console.log(execute ? 'APPLY mode' : 'DRY-RUN (default)');
  console.log(`Records: ${summary.totalRecords}`);
  console.log(`Keep: ${summary.keepCount}`);
  console.log(`Rename: ${summary.renameCount}`);
  console.log(`Route: ${summary.routeCount}`);
  console.log(`Archive: ${summary.archiveCount}`);
  console.log(`Review: ${summary.reviewCount}`);
  console.log('');
  console.log(formatNarrativeAnchorAuditMarkdown(summary).split('\n').slice(0, 50).join('\n'));
  console.log('');
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  if (execute) {
    const applied = results.filter((r) => r.status === 'applied').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`Applied ${applied}; failed ${failed}`);
  } else {
    console.log('\nPass --execute to apply soft routing/rename (no hard deletes).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

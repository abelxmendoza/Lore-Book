#!/usr/bin/env tsx
/**
 * Tenant-scoped journal occurrence repair.
 *
 * Usage:
 *   npx tsx scripts/journal-occurrence-repair.ts --user <uuid>
 *   npx tsx scripts/journal-occurrence-repair.ts --user <uuid> --apply
 *
 * Default is dry-run (zero writes). --apply requires --user <uuid>.
 */

import { repairJournalOccurrenceRows } from '../apps/server/src/services/temporal/journalOccurrenceRepairService';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const userId = arg('--user');
  const apply = process.argv.includes('--apply');
  if (!userId || !UUID_RE.test(userId)) {
    console.error('Usage: npx tsx scripts/journal-occurrence-repair.ts --user <uuid> [--apply]');
    process.exit(1);
  }
  const report = await repairJournalOccurrenceRows(userId, { apply });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Report-only audit for duplicate and stale Life Saga projection rows.
 *
 * Usage:
 *   npx tsx src/scripts/auditNarrativeProjection.ts --user <uuid>
 */
import { narrativeProjectionRepairService } from '../services/repair/narrativeProjectionRepairService';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const userIndex = args.indexOf('--user');
  const userId = userIndex >= 0 ? args[userIndex + 1] : undefined;

  if (!userId) {
    console.error('Usage: auditNarrativeProjection.ts --user <uuid>');
    process.exitCode = 1;
    return;
  }

  const report = await narrativeProjectionRepairService.auditUser(userId);
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

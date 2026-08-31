/**
 * Report-first repair for existing user-owned records.
 *
 * Usage:
 *   npx tsx src/scripts/auditExistingDataRepair.ts --user <uuid>
 *   npx tsx src/scripts/auditExistingDataRepair.ts --user <uuid> --apply
 */
import { existingDataRepairService } from '../services/repair/existingDataRepairService';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const userIndex = args.indexOf('--user');
  const userId = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const apply = args.includes('--apply');

  if (!userId) {
    console.error('Usage: auditExistingDataRepair.ts --user <uuid> [--apply]');
    process.exitCode = 1;
    return;
  }

  const report = await existingDataRepairService.auditUser(userId);
  console.log(JSON.stringify(report, null, 2));

  if (apply) {
    console.error('Applying only reversible review flags and deterministic false-card archival.');
    await existingDataRepairService.applyUserReport(report);
    console.error('Repair flags applied. Re-run without --apply to review the resulting report.');
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

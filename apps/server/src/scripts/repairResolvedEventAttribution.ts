/**
 * Tenant-scoped historical repair for resolved_events people/locations.
 *
 * Reclassifies mention vs participation from title + summary + linked unit
 * text, writes metadata.entityAttributions, and prunes contaminated arrays.
 * Never creates a new canonical event. Does not write the retired Character compatibility table.
 *
 * Dry-run (default):
 *   cd apps/server && npx tsx src/scripts/repairResolvedEventAttribution.ts --user <uuid>
 *   npm run attribution:audit --prefix apps/server -- --user <uuid>
 *
 * Apply (requires --user or --all):
 *   cd apps/server && npx tsx src/scripts/repairResolvedEventAttribution.ts --user <uuid> --apply
 *   npm run attribution:apply --prefix apps/server -- --user <uuid>
 */

import { repairResolvedEventAttributionForUser } from '../services/attribution/resolvedEventAttributionRepairService';
import { supabaseAdmin } from '../services/supabaseClient';

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function listUserIds(filterUserId?: string): Promise<string[]> {
  if (filterUserId) return [filterUserId];
  const { data, error } = await supabaseAdmin.from('resolved_events').select('user_id');
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.user_id as string).filter(Boolean))];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const allTenants = process.argv.includes('--all');
  const userFilter = argValue('--user');
  const limitRaw = argValue('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (apply && !userFilter && !allTenants) {
    console.error('Refusing --apply without --user <uuid> (or --all for every tenant). Dry-run is the default.');
    process.exit(1);
  }

  const userIds = await listUserIds(userFilter);
  const limitOpts = Number.isFinite(limit) ? { limit } : {};

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${userIds.length} user(s)`);
  for (const userId of userIds) {
    const report = await repairResolvedEventAttributionForUser(userId, {
      dryRun: !apply,
      ...limitOpts,
    });
    console.log(
      `user ${userId}: scanned ${report.eventsScanned}, ` +
        `${apply ? 'updated' : 'would update'} ${report.eventsChanged} ` +
        `(people -${report.peopleRemoved}/+${report.peopleAdded}, ` +
        `locations -${report.locationsRemoved}/+${report.locationsAdded})`,
    );
    for (const sample of report.samples) {
      console.log(
        `  · "${sample.title}" ` +
          `people-[${sample.peopleRemoved.join(',') || 'none'}] ` +
          `locations-[${sample.locationsRemoved.join(',') || 'none'}]`,
      );
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

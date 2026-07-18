/**
 * Backfill resolved_events.people / .locations by matching canonical
 * character/location names against event title + summary.
 *
 * Dry-run (default):
 *   cd apps/server && npx tsx src/scripts/backfillResolvedEventEntities.ts
 *
 * Apply:
 *   cd apps/server && npx tsx src/scripts/backfillResolvedEventEntities.ts --apply
 *
 * Single user:
 *   cd apps/server && npx tsx src/scripts/backfillResolvedEventEntities.ts --user <uuid> --apply
 */

import { resolvedEventEntityBackfillService } from '../services/chronologyV2/resolvedEventEntityBackfill';
import { supabaseAdmin } from '../services/supabaseClient';

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function listUserIds(filterUserId?: string): Promise<string[]> {
  if (filterUserId) return [filterUserId];
  const { data, error } = await supabaseAdmin.from('resolved_events').select('user_id');
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.user_id as string))];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userIds = await listUserIds(argValue('--user'));

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${userIds.length} user(s)`);
  for (const userId of userIds) {
    const report = await resolvedEventEntityBackfillService.backfillForUser(userId, !apply);
    console.log(
      `user ${userId}: scanned ${report.eventsScanned}, would update ${report.eventsUpdated} ` +
        `(+${report.peopleAdded} people, +${report.locationsAdded} locations)`,
    );
    for (const sample of report.samples) {
      console.log(
        `  · "${sample.title}" +people[${sample.peopleAdded.length}] +locations[${sample.locationsAdded.length}]`,
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

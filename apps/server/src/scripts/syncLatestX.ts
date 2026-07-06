/**
 * One-off helper: sync a small number of latest X posts for the main user
 * and run them through full ingestion + provenance stamping.
 * Run with: cd apps/server && npx tsx src/scripts/syncLatestX.ts
 * (Kept for future small refreshes; UI now defaults to recent-only.)
 */
import '../config';
import { resolveSupabaseUrlAtBoot } from '../lib/supabaseUrlResolution';
import { xConnectionService } from '../integrations/x/xConnection.service';

const MAIN_USER_ID = process.argv[2] || process.env.MAIN_USER_ID || 'REPLACE_WITH_YOUR_USER_ID';

async function main() {
  await resolveSupabaseUrlAtBoot();

  console.log('Triggering X sync for latest posts (small batch to avoid overwhelm)...');
  if (MAIN_USER_ID.includes('REPLACE')) {
    console.error('Please pass userId as arg or set MAIN_USER_ID env');
    process.exit(1);
  }
  const result = await xConnectionService.sync(MAIN_USER_ID, 5); // latest 5

  console.log('Sync result:', JSON.stringify(result, null, 2));
  console.log('X posts synced and sent through ingestion pipeline with provenance.');
  console.log('Check journal_entries with tag x-import, and entities with external_sources.');
}

main().catch((e) => {
  console.error('Sync failed:', e);
  process.exit(1);
});

/**
 * Run arc inference for a single user — additive/idempotent (arcService.upsert
 * keys on user_id+title), used to catch up a user's life_arcs after they fell
 * out of the nightly enrichment job's 30-day activity window.
 *
 * Usage: cd apps/server && npx tsx src/scripts/backfillLifeArcsForUser.ts <email>
 */
import 'dotenv/config';
import { supabaseAdmin } from '../services/supabaseClient';
import { arcInferenceService } from '../services/continuityRuntime/arcs/arcInferenceService';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/scripts/backfillLifeArcsForUser.ts <email>');
    process.exit(1);
  }
  const { data: userList, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  const match = userList.users.find((u) => u.email === email);
  if (!match) {
    console.error('No user found for', email);
    process.exit(1);
  }

  console.log('Running arc inference for', match.id, email);
  await arcInferenceService.runForUser(match.id);
  console.log('Done.');
}

main();

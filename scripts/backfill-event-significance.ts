#!/usr/bin/env tsx
/**
 * Sprint AL — Backfill event significance scores
 */

import { supabaseAdmin } from '../apps/server/src/services/supabaseClient';
import { scoreAllEventsForUser } from '../apps/server/src/services/events/eventSignificanceService';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveUserId(): Promise<string> {
  const userId = arg('--user-id');
  if (userId) return userId;
  const email = arg('--user');
  if (!email) throw new Error('Provide --user <email> or --user-id <uuid>');
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.id;
}

async function main() {
  const userId = await resolveUserId();
  console.log(`Scoring event significance for user ${userId}...`);
  const { scored } = await scoreAllEventsForUser(userId);
  console.log(`Done. Scored ${scored} event(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Run cross-session "society mapping" for a user: read their whole history and
 * link employers↔people↔workplaces + cluster recurring co-mentions into typed
 * groups. Dry-run by default (logs what it WOULD create).
 *
 *   npx tsx scripts/map-society.ts --user abelxmendoza@gmail.com [--execute] [--days 365]
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { societyMappingService } from '../apps/server/src/services/society/societyMappingService';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const u = data.users.find(c => c.email?.toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`No user for ${email}`);
  return u.id;
}

async function main() {
  const email = arg('--user') ?? 'abelxmendoza@gmail.com';
  const execute = process.argv.includes('--execute');
  const sinceDays = Number(arg('--days') ?? 365);
  const userId = await resolveUserId(email);

  console.log(`\n${execute ? 'EXECUTING' : 'DRY RUN'} society mapping for ${email} (${userId}), last ${sinceDays} days\n`);

  const summary = await societyMappingService.mapUser(userId, { sinceDays, dryRun: !execute });
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
  console.log(execute ? '\nApplied.' : '\n(dry-run — pass --execute to apply; see logs above for the would-create preview)');
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });

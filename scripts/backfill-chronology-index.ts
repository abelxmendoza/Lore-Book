#!/usr/bin/env tsx
/**
 * Backfill chronology_index from journal_entries for users whose entries
 * predate the sync trigger.
 *
 * Usage:
 *   npx tsx scripts/backfill-chronology-index.ts --user abelxmendoza@gmail.com
 *   npx tsx scripts/backfill-chronology-index.ts --all
 */
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { chronologyService } from '../apps/server/src/services/chronologyV2/chronologyService';

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

async function allUserIdsWithJournalEntries(): Promise<string[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('user_id');
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
}

async function main() {
  const email = arg('--user');
  const all = process.argv.includes('--all');

  let userIds: string[];
  if (all) {
    userIds = await allUserIdsWithJournalEntries();
    console.log(`Backfilling ${userIds.length} users with journal entries…`);
  } else if (email) {
    userIds = [await resolveUserId(email)];
  } else {
    console.error('Pass --user email@example.com or --all');
    process.exit(1);
  }

  let total = 0;
  for (const userId of userIds) {
    const count = await chronologyService.backfillChronologyIndex(userId);
    console.log(`${userId}: ${count} entries indexed`);
    total += count;
  }
  console.log(`Done — ${total} chronology rows upserted.`);
}

main().catch(e => { console.error(e); process.exit(1); });

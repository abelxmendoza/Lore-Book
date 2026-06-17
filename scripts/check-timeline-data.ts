#!/usr/bin/env tsx
/** Check timeline-related data for a user. Usage: npx tsx scripts/check-timeline-data.ts --user email@example.com */
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

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

async function countTable(table: string, userId: string) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) return `ERR: ${error.message}`;
  return count ?? 0;
}

async function main() {
  const email = arg('--user') ?? process.env.TARGET_USER_EMAIL ?? '';
  if (!email) { console.error('Required: --user <email> or TARGET_USER_EMAIL'); process.exit(1); }
  const userId = await resolveUserId(email);
  console.log(`User: ${email}\nID: ${userId}\n`);

  for (const t of ['journal_entries', 'chronology_index', 'life_arcs', 'events', 'organizations']) {
    console.log(`${t}: ${await countTable(t, userId)}`);
  }

  const { data: chronoSample } = await supabase
    .from('chronology_index')
    .select('journal_entry_id, start_time, end_time, time_precision')
    .eq('user_id', userId)
    .limit(3);
  console.log('\nchronology_index sample:', JSON.stringify(chronoSample, null, 2));

  const { data: arcsSample } = await supabase
    .from('life_arcs')
    .select('id, title, confidence, is_active, start_date, end_date')
    .eq('user_id', userId)
    .limit(5);
  console.log('\nlife_arcs sample:', JSON.stringify(arcsSample, null, 2));

  const { count: entriesNoDate } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('date', null);
  console.log(`\njournal_entries without date: ${entriesNoDate ?? 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });

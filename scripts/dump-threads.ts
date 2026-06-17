#!/usr/bin/env tsx
/**
 * READ-ONLY: dump a user's chat threads (grouped by session) and journal
 * entries so we can eyeball real groups/communities in their story.
 *
 * Usage: npx tsx scripts/dump-threads.ts --user <your-email>
 */
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

async function main() {
  const email = arg('--user') ?? process.env.TARGET_USER_EMAIL ?? '';
  if (!email) { console.error('Required: --user <email> or TARGET_USER_EMAIL'); process.exit(1); }
  const userId = await resolveUserId(email);

  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('role, content, created_at, session_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(5000);

  const bySession = new Map<string, Array<{ role: string; content: string }>>();
  for (const m of (msgs ?? []) as any[]) {
    const key = m.session_id ?? 'no-session';
    const list = bySession.get(key) ?? [];
    list.push({ role: m.role, content: m.content });
    bySession.set(key, list);
  }

  console.log(`=== CHAT SESSIONS (${bySession.size}) for ${email} ===\n`);
  let s = 0;
  for (const [session, list] of bySession) {
    console.log(`\n----- SESSION ${++s} (${session}) — ${list.length} msgs -----`);
    for (const m of list) {
      if (m.role !== 'user') continue; // user voice carries the story signal
      console.log(`  U: ${String(m.content).replace(/\s+/g, ' ').slice(0, 400)}`);
    }
  }

  const { data: entries } = await supabase
    .from('journal_entries')
    .select('content, date')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(1000);
  console.log(`\n\n=== JOURNAL ENTRIES (${(entries ?? []).length}) ===`);
  for (const e of (entries ?? []) as any[]) {
    console.log(`  (${e.date}) ${String(e.content).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

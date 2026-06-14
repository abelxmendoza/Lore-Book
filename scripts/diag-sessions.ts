#!/usr/bin/env tsx
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
const USER = process.env.ADMIN_USER_ID ?? '789bd607-e063-466f-a9ef-f68d24e8bb57';
async function main() {
  const { data } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, created_at')
    .eq('user_id', USER)
    .order('created_at', { ascending: true });
  const rows = (data ?? []) as any[];
  const bySession = new Map<string, number>();
  let nullSession = 0;
  for (const r of rows) {
    const s = r.session_id ?? null;
    if (s === null) { nullSession++; continue; }
    bySession.set(s, (bySession.get(s) ?? 0) + 1);
  }
  console.log('total messages:', rows.length);
  console.log('null session_id messages:', nullSession);
  console.log('distinct sessions:', bySession.size);
  const sizes = [...bySession.values()].sort((a, b) => b - a);
  console.log('session sizes (desc):', sizes.slice(0, 20));
  // show a couple sample sessions with names
  let shown = 0;
  for (const [sid, n] of [...bySession.entries()].sort((a, b) => b[1] - a[1])) {
    if (shown >= 3) break;
    const msgs = rows.filter(r => r.session_id === sid && r.role === 'user').map(r => String(r.content).slice(0, 80));
    console.log(`\nsession ${sid} (${n} msgs) sample user lines:`);
    for (const m of msgs.slice(0, 6)) console.log('   -', m);
    shown++;
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

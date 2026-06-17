#!/usr/bin/env tsx
/* Throwaway diagnostic: inspect a user's groups/org data + chat schema. */
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

const USER = process.env.TARGET_USER_ID ?? '';
if (!USER) {
  console.error('Required: TARGET_USER_ID environment variable.');
  process.exit(1);
}

async function count(table: string, extra?: (q: any) => any) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', USER);
  if (extra) q = extra(q);
  const { count, error } = await q;
  return error ? `ERR ${error.code} ${error.message}` : count;
}

async function main() {
  console.log('USER', USER);

  const { data: sample, error: sErr } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', USER)
    .limit(1);
  console.log('\nchat_messages columns:', sErr ? `ERR ${sErr.message}` : Object.keys(sample?.[0] ?? {}));
  if (sample?.[0]) {
    const r = sample[0] as any;
    console.log('  sample roles/thread:', { role: r.role, thread_id: r.thread_id, conversation_id: r.conversation_id, created_at: r.created_at });
  }

  console.log('\nCounts for user:');
  console.log('  chat_messages total :', await count('chat_messages'));
  console.log('  organizations       :', await count('organizations'));
  console.log('  group_candidates    :', await count('group_candidates'));
  console.log('  characters          :', await count('characters'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

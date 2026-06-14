#!/usr/bin/env tsx
/* Throwaway diagnostic: inspect admin user's groups/org data + chat schema. */
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

const USER = process.env.ADMIN_USER_ID ?? '789bd607-e063-466f-a9ef-f68d24e8bb57';

async function count(table: string, extra?: (q: any) => any) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', USER);
  if (extra) q = extra(q);
  const { count, error } = await q;
  return error ? `ERR ${error.code} ${error.message}` : count;
}

async function main() {
  console.log('USER', USER);

  // chat_messages sample to learn columns
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
  console.log('  chat_messages user  :', await count('chat_messages', q => q.eq('role', 'user')));
  console.log('  journal_entries     :', await count('journal_entries'));
  console.log('  threads             :', await count('threads'));
  console.log('  characters          :', await count('characters'));
  console.log('  organizations       :', await count('organizations'));
  console.log('  organization_members:', await (async () => {
    const { count, error } = await supabase.from('organization_members').select('*', { count: 'exact', head: true });
    return error ? `ERR ${error.message}` : count;
  })());
  console.log('  group_candidates    :', await count('group_candidates'));
  console.log('  group_candidates pnd:', await count('group_candidates', q => q.eq('status', 'pending')));
  console.log('  character_identity_index:', await count('character_identity_index'));

  // group_candidates columns
  const { data: gc } = await supabase.from('group_candidates').select('*').eq('user_id', USER).limit(1);
  console.log('\ngroup_candidates columns:', Object.keys(gc?.[0] ?? {}));

  // list orgs
  const { data: orgs } = await supabase.from('organizations').select('id, name, group_type, member_count, usage_count').eq('user_id', USER).limit(50);
  console.log('\norganizations:');
  for (const o of (orgs ?? []) as any[]) console.log(`  • ${o.name} [${o.group_type}] members=${o.member_count} usage=${o.usage_count}`);

  // pending candidates
  const { data: cands } = await supabase.from('group_candidates').select('proposed_name, detected_members, occurrence_count, confidence, status').eq('user_id', USER).eq('status', 'pending').limit(50);
  console.log('\npending candidates:');
  for (const c of (cands ?? []) as any[]) console.log(`  • ${c.proposed_name ?? '(unnamed)'} :: ${(c.detected_members ?? []).join(', ')} occ=${c.occurrence_count} conf=${c.confidence}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

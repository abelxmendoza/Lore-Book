#!/usr/bin/env tsx
/**
 * READ-ONLY inspection of an account's character/org/group state plus any chat
 * conversations that mention an agency like Kforce or the Amazon job.
 *
 * Usage:
 *   npx tsx scripts/inspect-kforce-state.ts --user abelxmendoza@gmail.com
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

async function safeSelect(table: string, userId: string, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns).eq('user_id', userId);
  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return [];
    console.warn(`  (warn) ${table}: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function main() {
  const email = arg('--user') ?? 'abelxmendoza@gmail.com';
  const userId = await resolveUserId(email);
  console.log(`Inspecting ${email} (${userId})\n`);

  const characters = await safeSelect(
    'characters',
    userId,
    'id, name, alias, archetype, importance_level, importance_score, relationship_depth, proximity_level, associated_with_character_ids, mentioned_by_character_ids, metadata'
  ) as any[];
  console.log(`CHARACTERS (${characters.length}):`);
  for (const c of characters) {
    console.log(
      `  • ${c.name} [${c.archetype ?? 'no-archetype'}] imp=${c.importance_level}/${c.importance_score} depth=${c.relationship_depth} assoc=${(c.associated_with_character_ids ?? []).length} | ${c.id}`
    );
  }

  const orgs = await safeSelect(
    'organizations',
    userId,
    'id, name, aliases, type, group_type, user_relationship, is_public_entity, description, metadata'
  ) as any[];
  console.log(`\nORGANIZATIONS (${orgs.length}):`);
  for (const o of orgs) {
    console.log(`  • ${o.name} [${o.group_type ?? o.type}] rel=${o.user_relationship} public=${o.is_public_entity} aliases=${(o.aliases ?? []).join(',')} | ${o.id}`);
    const { data: members } = await supabase.from('organization_members').select('character_name, role, status').eq('organization_id', o.id);
    for (const m of (members ?? []) as any[]) {
      console.log(`        - ${m.character_name} (${m.role ?? 'no role'}) [${m.status}]`);
    }
  }

  const orgRels = await safeSelect('organization_relationships', userId, '*') as any[];
  console.log(`\nORG RELATIONSHIPS (${orgRels.length}):`);
  for (const r of orgRels) {
    console.log(`  • ${r.from_org_id} --${r.relationship_type}--> ${r.to_org_id} ${r.notes ? `(${r.notes})` : ''}`);
  }

  const candidates = await safeSelect(
    'group_candidates',
    userId,
    'id, proposed_name, detected_members, suggested_group_type, status, confidence, occurrence_count, context'
  ) as any[];
  console.log(`\nGROUP CANDIDATES (${candidates.length}):`);
  for (const c of candidates) {
    console.log(`  • ${c.proposed_name ?? '(unnamed)'} :: ${(c.detected_members ?? []).join(', ')} [${c.suggested_group_type}] ${c.status} conf=${c.confidence} occ=${c.occurrence_count}`);
    if (c.context) console.log(`        ctx: ${String(c.context).slice(0, 160)}`);
  }

  // Chat conversations mentioning Kforce / Amazon / hired / agency / recruiter
  const TERMS = ['kforce', 'amazon', 'recruiter', 'agency', 'onboarding', 'hired', 'staffing'];
  console.log(`\nCHAT MESSAGES mentioning [${TERMS.join(', ')}]:`);
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, session_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2000);
  const hits = ((msgs ?? []) as any[]).filter(m =>
    TERMS.some(t => (m.content ?? '').toLowerCase().includes(t))
  );
  console.log(`  matched ${hits.length} messages`);
  for (const m of hits.slice(0, 40)) {
    console.log(`  [${m.role}] (${m.session_id ?? 'no-session'}) ${String(m.content).replace(/\s+/g, ' ').slice(0, 240)}`);
  }

  // Journal entries too
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, content, date')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(1000);
  const entryHits = ((entries ?? []) as any[]).filter(e =>
    TERMS.some(t => (e.content ?? '').toLowerCase().includes(t))
  );
  console.log(`\nJOURNAL ENTRIES mentioning terms: ${entryHits.length}`);
  for (const e of entryHits.slice(0, 20)) {
    console.log(`  (${e.date}) ${String(e.content).replace(/\s+/g, ' ').slice(0, 240)}`);
  }
}

main().catch(error => {
  console.error('Inspection failed:', error);
  process.exit(1);
});

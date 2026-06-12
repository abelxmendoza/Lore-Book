#!/usr/bin/env tsx
/**
 * Remove fabricated test people and every trace they left behind:
 * characters, omega entities, facts, events, knowledge, perceptions, and the
 * test journal entries / chat messages that mention them.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-test-entities.ts --user <email> --names "Quintessa,Zephyrne Quillborn"
 *   pnpm tsx scripts/cleanup-test-entities.ts --user <email> --names "..." --execute
 *
 * Dry-run by default — prints what would be deleted. Pass --execute to apply.
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

type Args = { user: string; names: string[]; execute: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const user = get('--user');
  const names = (get('--names') ?? '').split(',').map(n => n.trim()).filter(Boolean);
  if (!user || names.length === 0) {
    console.error('Usage: cleanup-test-entities.ts --user <email> --names "Name1,Name2" [--execute]');
    process.exit(1);
  }
  return { user, names, execute: argv.includes('--execute') };
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No auth user found for email ${email}`);
    process.exit(1);
  }
  return user.id;
}

// Match on full names plus their distinctive tokens (>3 chars), so
// "Zephyrne Quillborn" also catches a record stored as just "Zephyrne".
const expandNames = (names: string[]) => {
  const variants = new Set<string>();
  for (const n of names) {
    variants.add(n.toLowerCase());
    for (const token of n.split(/\s+/)) {
      if (token.length > 3) variants.add(token.toLowerCase());
    }
  }
  return Array.from(variants);
};

const matchesAny = (text: string | null | undefined, names: string[]) =>
  Boolean(text && names.some(n => text.toLowerCase().includes(n)));

async function main() {
  const { user, names: rawNames, execute } = parseArgs();
  const names = expandNames(rawNames);
  const userId = await resolveUserId(user);
  console.log(`${execute ? 'EXECUTING' : 'DRY RUN'} — user ${user} (${userId}), matching: ${names.join(', ')}\n`);

  const report: Record<string, number> = {};
  const note = (label: string, count: number) => {
    report[label] = (report[label] ?? 0) + count;
    if (count > 0) console.log(`  ${label}: ${count}`);
  };

  // ── 1. Find the characters and omega entities ────────────────────────────
  const { data: allChars } = await supabase
    .from('characters')
    .select('id, name, alias, metadata')
    .eq('user_id', userId);
  const characters = (allChars ?? []).filter(c =>
    matchesAny(c.name, names) || (c.alias ?? []).some((a: string) => matchesAny(a, names)));
  const charIds = characters.map(c => c.id);
  console.log(`Characters matched: ${characters.map(c => c.name).join(', ') || '(none)'}`);

  const { data: allOmega } = await supabase
    .from('omega_entities')
    .select('id, primary_name, aliases')
    .eq('user_id', userId);
  const omegaEntities = (allOmega ?? []).filter(e =>
    matchesAny(e.primary_name, names) || (e.aliases ?? []).some((a: string) => matchesAny(a, names)));
  const omegaIds = new Set<string>(omegaEntities.map(e => e.id));
  for (const c of characters) {
    const oid = (c.metadata as Record<string, any> | null)?.omega_entity_id;
    if (oid) omegaIds.add(oid);
  }
  console.log(`Omega entities matched: ${omegaEntities.map(e => e.primary_name).join(', ') || '(none)'}\n`);

  // ── 2. Events involving them (by participant id or by name in text) ──────
  const { data: allEvents } = await supabase
    .from('resolved_events')
    .select('*')
    .eq('user_id', userId);
  const events = (allEvents ?? []).filter((ev: Record<string, any>) =>
    (ev.people ?? []).some((p: string) => omegaIds.has(p)) ||
    matchesAny(ev.title, names) || matchesAny(ev.event_title, names) ||
    matchesAny(ev.summary, names) || matchesAny(ev.event_summary, names));

  // ── 3. Test journal entries / chat messages mentioning them ──────────────
  const { data: allEntries } = await supabase
    .from('journal_entries')
    .select('id, content, summary')
    .eq('user_id', userId);
  const entries = (allEntries ?? []).filter(e =>
    matchesAny(e.content, names) || matchesAny(e.summary, names));

  // Events derived from those entries go too
  const entryIds = new Set(entries.map(e => e.id));
  for (const ev of (allEvents ?? []) as Array<Record<string, any>>) {
    if (ev.source_entry_id && entryIds.has(ev.source_entry_id) && !events.includes(ev)) events.push(ev);
  }
  const eventIds = events.map((e: Record<string, any>) => e.id);

  console.log(`Events to delete (${events.length}):`);
  for (const ev of events as Array<Record<string, any>>) {
    console.log(`  - ${ev.event_title ?? ev.title ?? '(untitled)'} [${ev.id}]`);
  }
  console.log(`Journal entries to delete (${entries.length}):`);
  for (const e of entries) console.log(`  - ${(e.summary ?? e.content ?? '').slice(0, 80)} [${e.id}]`);
  console.log('');

  if (!execute) {
    console.log('Dry run only. Re-run with --execute to apply.');
    return;
  }

  // Deletes a filtered set and reports; tolerates tables that don't exist.
  const del = async (label: string, table: string, apply: (q: any) => any) => {
    try {
      const { data, error } = await apply(supabase.from(table).delete().eq('user_id', userId)).select('id');
      if (error) throw error;
      note(label, data?.length ?? 0);
    } catch (err: any) {
      console.log(`  ${label}: skipped (${err.message ?? err})`);
    }
  };
  // Same but for tables without a user_id column (scoped by FK ids instead).
  const delByIds = async (label: string, table: string, column: string, ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { data, error } = await supabase.from(table).delete().in(column, ids).select('id');
      if (error) throw error;
      note(label, data?.length ?? 0);
    } catch (err: any) {
      console.log(`  ${label}: skipped (${err.message ?? err})`);
    }
  };

  console.log('Deleting…');

  // Event children first, then the events
  for (const table of ['character_timeline_events', 'event_unit_links', 'event_mentions', 'event_impacts', 'event_causal_links']) {
    await delByIds(`${table} (by event)`, table, 'event_id', eventIds);
  }
  await delByIds('resolved_events', 'resolved_events', 'id', eventIds);

  // Event candidates naming them
  try {
    const { data: candidates } = await supabase
      .from('event_candidates')
      .select('id, dominant_entity_names')
      .eq('user_id', userId);
    const candidateIds = (candidates ?? [])
      .filter(c => (c.dominant_entity_names ?? []).some((n: string) => matchesAny(n, names)))
      .map(c => c.id);
    await delByIds('event_candidates', 'event_candidates', 'id', candidateIds);
  } catch (err: any) {
    console.log(`  event_candidates: skipped (${err.message ?? err})`);
  }

  // Facts: about them, or mentioning them on other entities
  await delByIds('entity_facts (by entity)', 'entity_facts', 'entity_id', charIds);
  for (const name of names) {
    await del(`entity_facts mentioning "${name}"`, 'entity_facts', q => q.ilike('fact', `%${name}%`));
    await del(`crystallized_knowledge mentioning "${name}"`, 'crystallized_knowledge', q =>
      q.or(`machine_claim.ilike.%${name}%,human_readable_claim.ilike.%${name}%`));
    await del(`omega_claims mentioning "${name}"`, 'omega_claims', q => q.ilike('text', `%${name}%`));
    await del(`conversation_messages mentioning "${name}"`, 'conversation_messages', q => q.ilike('content', `%${name}%`));
    await del(`chat_messages mentioning "${name}"`, 'chat_messages', q => q.ilike('content', `%${name}%`));
    await del(`threads titled "${name}"`, 'threads', q => q.ilike('title', `%${name}%`));
  }

  // Perceptions tied to them
  await delByIds('perception_entries (subject)', 'perception_entries', 'subject_person_id', charIds);
  await delByIds('perception_entries (source)', 'perception_entries', 'source_character_id', charIds);

  // Journal entries last among content (events referencing them are gone)
  await delByIds('journal_entries', 'journal_entries', 'id', entries.map(e => e.id));

  // Characters + their cascades and omega graph
  const { characterDeletionService } = await import('../apps/server/src/services/characterDeletionService');
  for (const c of characters) {
    const r = await characterDeletionService.deleteCharacter(userId, c.id, { deleteEvents: true });
    if (r) note(`character "${c.name}"`, 1);
  }
  // Omega entities that had no character row
  await delByIds('omega_entities (leftover)', 'omega_entities', 'id', Array.from(omegaIds));

  // Refresh standing so degree/connector stats forget the deleted people
  const { socialStandingService } = await import('../apps/server/src/services/socialStandingService');
  await socialStandingService.recompute(userId);
  console.log('\nSocial standing recomputed.');

  console.log('\nDone. Summary:');
  for (const [label, count] of Object.entries(report)) console.log(`  ${label}: ${count}`);
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Purge seeded mock/test data from a REAL user account so the UI shows only
 * conversation-derived data. Dry-run by default — nothing is deleted without
 * --execute.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-mock-data.ts --user <email>            # dry run (report only)
 *   pnpm tsx scripts/cleanup-mock-data.ts --user <email> --execute  # delete fabricated/mock rows
 *   pnpm tsx scripts/cleanup-mock-data.ts --user <email> --orphans  # ALSO report entities never mentioned in chats/journal (never deletes them)
 *
 * What it removes (high-precision, safe):
 *   - rows whose name/title matches known fabricated test terms (zephyrine, quintessa, …)
 *   - rows with a synthetic id prefix (dummy-, mock-, demo-)
 *   - rows explicitly marked as mock in metadata (is_mock / seed / source: 'mock')
 *
 * It deliberately does NOT delete real-looking names by guesswork. The --orphans
 * report flags entities with no conversation grounding for manual review.
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

const FABRICATED = /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock|of debt)\b/i;
const MOCK_ID_PREFIX = /^(dummy-|mock-|demo-|char-alex-boyfriend|dummy-loc-)/i;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

function isMockMarked(row: Record<string, any>): boolean {
  const md = row.metadata ?? {};
  if (md.is_mock === true || md.seed === true || md.mock === true) return true;
  if (typeof md.source === 'string' && md.source.toLowerCase() === 'mock') return true;
  if (typeof row.source === 'string' && row.source.toLowerCase() === 'mock') return true;
  if (typeof row.id === 'string' && MOCK_ID_PREFIX.test(row.id)) return true;
  return false;
}

function isFabricated(text: string): boolean {
  return FABRICATED.test(text || '');
}

interface TableSpec {
  table: string;
  /** Columns that hold the display name(s). */
  nameCols: string[];
}

const TABLES: TableSpec[] = [
  { table: 'characters',         nameCols: ['name'] },
  { table: 'organizations',      nameCols: ['name'] },
  { table: 'people_places',      nameCols: ['name'] },
  { table: 'group_candidates',   nameCols: ['proposed_name', 'detected_members'] },
  { table: 'quests',             nameCols: ['title'] },
  { table: 'skills',             nameCols: ['skill_name'] },
];

async function scanTable(userId: string, spec: TableSpec, execute: boolean) {
  let rows: Record<string, any>[] = [];
  try {
    const { data, error } = await supabase.from(spec.table).select('*').eq('user_id', userId);
    if (error) { console.log(`  · ${spec.table}: skipped (${error.message})`); return; }
    rows = data ?? [];
  } catch (e: any) {
    console.log(`  · ${spec.table}: skipped (${e?.message ?? e})`);
    return;
  }

  const flagged = rows.filter(row => {
    if (isMockMarked(row)) return true;
    const text = spec.nameCols
      .map(c => Array.isArray(row[c]) ? row[c].join(' ') : row[c])
      .filter(Boolean)
      .join(' ');
    return isFabricated(text);
  });

  if (flagged.length === 0) {
    console.log(`  ✓ ${spec.table}: clean (${rows.length} rows)`);
    return;
  }

  const label = (row: Record<string, any>) =>
    spec.nameCols.map(c => Array.isArray(row[c]) ? `[${row[c].join(', ')}]` : row[c]).filter(Boolean).join(' / ');

  console.log(`  ⚠ ${spec.table}: ${flagged.length} mock/fabricated row(s)`);
  for (const row of flagged) console.log(`      - ${label(row)}  (${row.id})`);

  if (execute) {
    const ids = flagged.map(r => r.id);
    const { error } = await supabase.from(spec.table).delete().in('id', ids).eq('user_id', userId);
    if (error) console.log(`      ✗ delete failed: ${error.message}`);
    else console.log(`      ✓ deleted ${ids.length}`);
  }
}

/** Report-only: entities whose name never appears in the user's chats/journal. */
async function reportOrphans(userId: string) {
  console.log('\nOrphan report — entities not found in any chat/journal text (review manually, NOT deleted):');
  const [{ data: msgs }, { data: entries }] = await Promise.all([
    supabase.from('chat_messages').select('content').eq('user_id', userId).limit(5000),
    supabase.from('journal_entries').select('content').eq('user_id', userId).limit(5000),
  ]);
  const corpus = [
    ...((msgs ?? []) as Array<{ content: string }>).map(m => m.content),
    ...((entries ?? []) as Array<{ content: string }>).map(e => e.content),
  ].join('\n').toLowerCase();

  for (const spec of TABLES.filter(t => t.table !== 'group_candidates')) {
    const { data } = await supabase.from(spec.table).select('*').eq('user_id', userId);
    const orphans = (data ?? []).filter(row => {
      const name = (row[spec.nameCols[0]] ?? '').toString().trim().toLowerCase();
      return name.length >= 3 && !corpus.includes(name);
    });
    if (orphans.length > 0) {
      console.log(`  ${spec.table}: ${orphans.length} not mentioned in conversations`);
      for (const row of orphans) console.log(`      - ${row[spec.nameCols[0]]}  (${row.id})`);
    }
  }
}

async function main() {
  const email = arg('--user');
  if (!email) { console.error('Usage: --user <email> [--execute] [--orphans]'); process.exit(1); }
  const execute = has('--execute');
  const userId = await resolveUserId(email);

  console.log(`\nMock-data cleanup for ${email} (${userId})`);
  console.log(execute ? '*** EXECUTE MODE — deletions will be applied ***\n' : 'Dry run (no changes). Add --execute to apply.\n');

  for (const spec of TABLES) await scanTable(userId, spec, execute);
  if (has('--orphans')) await reportOrphans(userId);

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env tsx
/**
 * Sprint AD validation — before/after report for the relationship scoring engine.
 *
 * Usage:
 *   pnpm tsx scripts/validate-relationship-scoring.ts --user <email>           # report only (no writes)
 *   pnpm tsx scripts/validate-relationship-scoring.ts --user <email> --apply   # run scoring, then re-report
 *
 * Prints score distributions, how many rows sit at the 0.5 default, high-risk &
 * reconnection counts, and any schema mismatches discovered.
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { romanticRelationshipScoring } from '../apps/server/src/services/conversationCentered/romanticRelationshipScoring';

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

const SCORE_COLS = ['affection_score', 'relationship_health', 'compatibility_score', 'emotional_intensity', 'ambiguity_level'];

function snapshot(rows: any[]) {
  const n = rows.length;
  const atDefault = (col: string) => rows.filter(r => Number(r[col]) === 0.5).length;
  const avg = (col: string) => n ? (rows.reduce((s, r) => s + Number(r[col] ?? 0), 0) / n) : 0;
  const distinct = (col: string) => new Set(rows.map(r => Number(r[col]).toFixed(2))).size;

  console.log(`  relationships: ${n}`);
  for (const col of SCORE_COLS) {
    console.log(`    ${col.padEnd(22)} avg=${avg(col).toFixed(2)}  distinctValues=${distinct(col)}  at-0.5-default=${atDefault(col)}/${n}`);
  }
  const withFlags = rows.filter(r => (r.red_flags?.length ?? 0) + (r.green_flags?.length ?? 0) > 0).length;
  const highRisk = rows.filter(r =>
    (r.red_flags?.length ?? 0) >= 2 ||
    Number(r.relationship_health) < 0.4 ||
    (r.metadata?.signals?.obsession_score ?? 0) >= 0.6 ||
    ['blocked', 'ghosted', 'complicated'].includes((r.status || '').toLowerCase())
  ).length;
  const reconnection = rows.filter(r => {
    const ended = !r.is_current || ['ended', 'ghosted', 'blocked'].includes((r.status || '').toLowerCase());
    return ended && ((r.green_flags?.length ?? 0) > (r.red_flags?.length ?? 0) || (r.status || '').toLowerCase() === 'rekindled');
  }).length;
  const withSignals = rows.filter(r => r.metadata?.signals).length;
  console.log(`    rows with flags: ${withFlags}/${n}   with obsession/attachment signals: ${withSignals}/${n}`);
  console.log(`    HIGH RISK count: ${highRisk}   RECONNECTION count: ${reconnection}`);
}

async function load(userId: string) {
  const { data, error } = await supabase.from('romantic_relationships').select('*').eq('user_id', userId);
  if (error) {
    if ((error as any).code === 'PGRST205') { console.log('  ⚠ romantic_relationships table not present (PGRST205).'); return []; }
    throw error;
  }
  return data ?? [];
}

async function main() {
  const email = arg('--user');
  if (!email) { console.error('Usage: --user <email> [--apply]'); process.exit(1); }
  const userId = await resolveUserId(email);
  console.log(`\nRelationship scoring validation for ${email} (${userId})\n`);

  console.log('BEFORE:');
  const before = await load(userId);
  snapshot(before);

  if (has('--apply')) {
    console.log('\nRunning scoreAllForUser…');
    const res = await romanticRelationshipScoring.scoreAllForUser(userId);
    console.log(`  scored ${res.scored} relationships`);

    console.log('\nAFTER:');
    snapshot(await load(userId));
  } else {
    console.log('\n(report only — pass --apply to run scoring and see the AFTER snapshot)');
  }

  // Schema note: obsession_score/attachment_intensity are stored in
  // metadata.signals (no dedicated columns). Flag if a column ever appears.
  console.log('\nSchema note: obsession_score & attachment_intensity persist under metadata.signals (no columns).');
  console.log('Done.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

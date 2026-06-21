/**
 * Measure egress savings from column projection (the embedding-egress sprint).
 *
 * For each embedding-bearing table this fetches a sample BOTH ways — `select('*')`
 * vs. every column EXCEPT `embedding` — over the SAME rows, then compares the size
 * of the JSON payload PostgREST actually returns. JSON is what crosses the wire and
 * is billed as egress, so this is a truer measure than Postgres binary row size (a
 * 1536-float vector serialized as JSON text is even larger than its ~6 KB on disk).
 *
 * Usage: npx tsx scripts/measure-egress-rowsize.ts [sampleSize]
 * Or:    npm run egress:rowsize
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env (read-only; no writes).
 */

import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ -> server -> apps -> repo root (where .env lives). Load both the repo
// root and apps/server in case env files are split.
const repoRoot = resolve(__dirname, '../../..');
const serverDir = resolve(__dirname, '..');
for (const dir of [repoRoot, serverDir]) {
  dotenv.config({ path: resolve(dir, '.env') });
  dotenv.config({ path: resolve(dir, '.env.development') });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

// Tables that carry a 1536-dim `embedding` vector. The script derives the
// projected column set automatically (all keys minus `embedding`), so it stays
// correct as schemas change.
const TABLES = ['omega_entities', 'omega_claims', 'memory_components', 'journal_entries', 'characters'];
const VECTOR_COLS = new Set(['embedding']);

const SAMPLE = Math.max(1, parseInt(process.argv[2] ?? '50', 10));

function bytes(obj: unknown): number {
  return Buffer.byteLength(JSON.stringify(obj ?? []), 'utf8');
}

function fmtKB(b: number): string {
  return `${(b / 1024).toFixed(1)} KB`;
}

async function measureTable(table: string) {
  // 1) Fetch a stable sample with everything.
  const { data: fullRows, error: fullErr } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(SAMPLE);

  if (fullErr) return { table, skipped: fullErr.message };
  if (!fullRows || fullRows.length === 0) return { table, skipped: 'no rows' };

  const keys = Object.keys(fullRows[0]);
  const vectorKeys = keys.filter((k) => VECTOR_COLS.has(k));
  if (vectorKeys.length === 0) return { table, skipped: 'no embedding column' };

  const projectedCols = keys.filter((k) => !VECTOR_COLS.has(k)).join(', ');

  // 2) Fetch the SAME rows with the projected columns only.
  const { data: projRows, error: projErr } = await supabase
    .from(table)
    .select(projectedCols)
    .order('created_at', { ascending: false })
    .limit(SAMPLE);

  if (projErr) return { table, skipped: projErr.message };

  // 3) Total row count, to extrapolate a full-table fetch.
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });

  const n = fullRows.length;
  const fullBytes = bytes(fullRows);
  const projBytes = bytes(projRows);
  const fullPerRow = fullBytes / n;
  const projPerRow = projBytes / n;
  const reduction = 1 - projBytes / fullBytes;

  return {
    table,
    rowsSampled: n,
    totalRows: count ?? null,
    fullPerRow,
    projPerRow,
    savedPerRow: fullPerRow - projPerRow,
    reduction,
  };
}

async function main() {
  console.log(`\nEgress row-size measurement (sample ${SAMPLE} rows/table)`);
  console.log('JSON payload size = what PostgREST returns over the wire = billed egress.\n');

  const pad = (s: string, w: number) => s.padEnd(w);
  const padL = (s: string, w: number) => s.padStart(w);
  console.log(
    pad('table', 18) + padL('select(*)', 12) + padL('projected', 12) + padL('saved/row', 12) + padL('cut', 7) + padL('full-table*', 14)
  );
  console.log('-'.repeat(75));

  for (const table of TABLES) {
    const r = await measureTable(table);
    if ('skipped' in r) {
      // The data API gets restricted once the project blows its egress quota —
      // exactly the failure this sprint exists to prevent. Surface it once, loud.
      if (/exceed_egress_quota|restricted/i.test(r.skipped)) {
        console.log('\n⚠️  Supabase data API is RESTRICTED (egress quota exceeded).');
        console.log('   Row fetches over PostgREST are blocked until the plan is upgraded or');
        console.log('   the spend cap is lifted. Re-run this once service is restored.\n');
        return;
      }
      console.log(pad(table, 18) + padL(`— ${r.skipped}`, 57));
      continue;
    }
    const fullTableSaved = r.totalRows ? r.savedPerRow * r.totalRows : 0;
    console.log(
      pad(r.table, 18) +
        padL(fmtKB(r.fullPerRow), 12) +
        padL(fmtKB(r.projPerRow), 12) +
        padL(fmtKB(r.savedPerRow), 12) +
        padL(`${(r.reduction * 100).toFixed(0)}%`, 7) +
        padL(fmtKB(fullTableSaved), 14)
    );
  }
  console.log('\n* full-table* = saved/row × total rows: egress avoided for one full-table scan.');
  console.log('  Multiply by how often each path runs (per chat message, per poll) for real impact.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

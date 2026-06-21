#!/usr/bin/env node
/**
 * Migration drift AUDIT — classifies each repo migration whose name is not yet
 * recorded in supabase_migrations.schema_migrations by inspecting whether the DB
 * objects it creates already exist.
 *
 * Unlike check-migration-drift.mjs (which only compares names), this parses each
 * SQL file for the objects it creates (tables, functions, indexes, views, types,
 * columns, policies) and probes the live catalog, so it can tell
 * "applied-but-unrecorded" apart from "genuinely unapplied".
 *
 * Run:
 *   node scripts/audit-migration-drift.mjs            # dry run report
 *   node scripts/audit-migration-drift.mjs --backfill # record confirmed-applied ones
 *
 * Classification:
 *   applied        every detected object exists  → safe to backfill
 *   unapplied      none of the detected objects exist
 *   partial        some exist, some don't (needs eyes)
 *   indeterminate  no verifiable CREATE/ADD objects (data-only / grants) — skipped
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const BACKFILL = process.argv.includes('--backfill');

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch { /* rely on process.env */ }
}
loadEnv();

const RAW_URL = process.env.DATABASE_URL || process.env.SUPABASE_CONNECTION_STRING;
if (!RAW_URL) {
  console.error('✗ DATABASE_URL (or SUPABASE_CONNECTION_STRING) required');
  process.exit(1);
}
const CONN = RAW_URL.replace(/\?.*$/, '');

// ── identity (mirrors migrationRunner.parseMigrationIdentity + drift name slug) ─
function identity(file) {
  const base = (file.split('/').pop() ?? file).replace(/\.sql$/i, '');
  const m = base.match(/^(\d+)_?(.*)$/);
  if (m && m[1]) return { version: m[1], name: m[2] || m[1] };
  return { version: new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14), name: base };
}

// ── object extraction from SQL ────────────────────────────────────────────────
function strip(s) { return s.replace(/"/g, '').toLowerCase(); }
function bareName(qualified) { return strip(qualified).replace(/^public\./, ''); }

function extractObjects(sql) {
  const objs = [];
  const add = (kind, key) => objs.push({ kind, key });

  let m;
  const reTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public\.)?"?[\w]+"?)/gi;
  while ((m = reTable.exec(sql))) add('relation', bareName(m[1]));

  const reView = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?((?:public\.)?"?[\w]+"?)/gi;
  while ((m = reView.exec(sql))) add('relation', bareName(m[1]));

  const reFunc = /create\s+(?:or\s+replace\s+)?function\s+((?:public\.)?"?[\w]+"?)/gi;
  while ((m = reFunc.exec(sql))) add('function', bareName(m[1]));

  const reIndex = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("?[\w]+"?)\s+on/gi;
  while ((m = reIndex.exec(sql))) add('index', strip(m[1]));

  const reType = /create\s+type\s+((?:public\.)?"?[\w]+"?)/gi;
  while ((m = reType.exec(sql))) add('type', bareName(m[1]));

  const reCol = /alter\s+table\s+(?:if\s+exists\s+)?((?:public\.)?"?[\w]+"?)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi;
  while ((m = reCol.exec(sql))) add('column', `${bareName(m[1])}.${strip(m[2])}`);

  const rePolicy = /create\s+policy\s+("[^"]+"|'[^']+'|[\w]+)\s+on\s+((?:public\.)?"?[\w]+"?)/gi;
  while ((m = rePolicy.exec(sql))) {
    const pname = m[1].replace(/^["']|["']$/g, '').toLowerCase();
    add('policy', `${bareName(m[2])}::${pname}`);
  }

  // dedupe
  const seen = new Set();
  return objs.filter((o) => {
    const k = `${o.kind}:${o.key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── main ──────────────────────────────────────────────────────────────────────
const sql = postgres(CONN, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

try {
  // applied names (drift uses name-based matching)
  const appliedRows = await sql`select name from supabase_migrations.schema_migrations where name is not null`;
  const appliedNames = new Set(appliedRows.map((r) => r.name));

  // catalogs
  const relations = new Set(
    (await sql`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p')`).map((r) => r.relname.toLowerCase()),
  );
  const indexes = new Set(
    (await sql`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'`).map((r) => r.relname.toLowerCase()),
  );
  const functions = new Set(
    (await sql`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`).map((r) => r.proname.toLowerCase()),
  );
  const types = new Set(
    (await sql`select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'`).map((r) => r.typname.toLowerCase()),
  );
  const columns = new Set(
    (await sql`select table_name, column_name from information_schema.columns where table_schema='public'`).map((r) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`),
  );
  const policies = new Set(
    (await sql`select tablename, policyname from pg_policies where schemaname='public'`).map((r) => `${r.tablename.toLowerCase()}::${r.policyname.toLowerCase()}`),
  );

  const exists = (o) => {
    switch (o.kind) {
      case 'relation': return relations.has(o.key);
      case 'index': return indexes.has(o.key);
      case 'function': return functions.has(o.key);
      case 'type': return types.has(o.key);
      case 'column': return columns.has(o.key);
      case 'policy': return policies.has(o.key);
      default: return false;
    }
  };

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const buckets = { applied: [], unapplied: [], partial: [], indeterminate: [] };

  for (const file of files) {
    const { name } = identity(file);
    if (!name || appliedNames.has(name)) continue; // already recorded

    const objs = extractObjects(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    if (objs.length === 0) {
      buckets.indeterminate.push({ file, name, detail: 'no verifiable CREATE/ADD objects' });
      continue;
    }
    const present = objs.filter(exists).length;
    if (present === objs.length) buckets.applied.push({ file, name, detail: `${present}/${objs.length} objects present` });
    else if (present === 0) buckets.unapplied.push({ file, name, detail: `0/${objs.length} objects present` });
    else buckets.partial.push({ file, name, detail: `${present}/${objs.length} objects present`, missing: objs.filter((o) => !exists(o)).map((o) => `${o.kind}:${o.key}`) });
  }

  const print = (label, arr) => {
    console.log(`\n=== ${label} (${arr.length}) ===`);
    for (const x of arr) console.log(`  ${x.name.padEnd(48)} ${x.detail}${x.missing ? ' | missing: ' + x.missing.join(', ') : ''}`);
  };
  print('APPLIED (safe to backfill)', buckets.applied);
  print('PARTIAL (needs review)', buckets.partial);
  print('UNAPPLIED (genuinely missing)', buckets.unapplied);
  print('INDETERMINATE (data-only / skipped)', buckets.indeterminate);

  if (BACKFILL && buckets.applied.length) {
    console.log(`\nBackfilling ${buckets.applied.length} confirmed-applied migrations into schema_migrations...`);
    // Track names + versions live so we dedup by name and never collide on the
    // version primary key (different files can share a numeric prefix).
    const recordedNames = new Set(appliedNames);
    const versionsRows = await sql`select version from supabase_migrations.schema_migrations`;
    const usedVersions = new Set(versionsRows.map((r) => r.version));
    let recorded = 0;
    for (const x of buckets.applied) {
      const { version, name } = identity(x.file);
      if (recordedNames.has(name)) { console.log(`  ⏭  already recorded ${name}`); continue; }
      let candidate = version;
      for (let i = 1; usedVersions.has(candidate); i += 1) {
        candidate = `${version}_${name}${i > 1 ? `_${i}` : ''}`.slice(0, 255);
      }
      await sql`
        insert into supabase_migrations.schema_migrations (version, name, created_by)
        values (${candidate}, ${name}, 'audit-backfill')
      `;
      usedVersions.add(candidate);
      recordedNames.add(name);
      recorded += 1;
      console.log(`  ✅ recorded ${name}`);
    }
    console.log(`\nRecorded ${recorded} new migration(s).`);
  } else if (!BACKFILL) {
    console.log('\n(dry run — re-run with --backfill to record the APPLIED bucket)');
  }
} catch (e) {
  console.error('AUDIT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

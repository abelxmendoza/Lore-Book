#!/usr/bin/env node
/**
 * Migration drift check — compares supabase/migrations/ against what is
 * actually applied on the remote database.
 * Run: npm run check:drift          (fails on NEW drift)
 *      npm run check:drift -- --update-baseline   (accept current drift)
 *
 * Why: migrations sat in this repo for months without ever being applied
 * (interests_tracking, entity_resolution_cache), and prod-only errors like
 * PGRST205 "table not in schema cache" cost days to trace. This check makes
 * repo-vs-prod schema divergence loud.
 *
 * Matching is by migration NAME (the part after the version prefix), not by
 * version: files applied late get re-recorded under a new version, but the
 * name survives.
 *
 * Historical drift predating this check lives in
 * scripts/migration-drift-baseline.json. Only drift NOT in the baseline
 * fails the check, so it can run in CI from day one.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const BASELINE_PATH = resolve(__dir, 'migration-drift-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ── Load root .env (CI provides real env vars instead) ───────────────────────

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

// ── Gather both sides ─────────────────────────────────────────────────────────

/** "20260610224955_omega_entities_embedding_mention_columns.sql" → name slug */
function localNames() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace(/\.sql$/, '').replace(/^\d+_?/, ''))
    .filter(Boolean);
}

async function remoteNames() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/applied_migrations`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`applied_migrations RPC failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return rows.map(r => r.name).filter(Boolean);
}

// ── Compare ───────────────────────────────────────────────────────────────────

const local = new Set(localNames());
const remote = new Set(await remoteNames());

const unapplied = [...local].filter(n => !remote.has(n)).sort();   // in repo, never run on prod
const untracked = [...remote].filter(n => !local.has(n)).sort();   // run on prod, missing from repo

if (UPDATE_BASELINE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ unapplied, untracked }, null, 2) + '\n');
  console.log(`Baseline updated: ${unapplied.length} unapplied, ${untracked.length} untracked accepted.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { unapplied: [], untracked: [] };

const newUnapplied = unapplied.filter(n => !baseline.unapplied.includes(n));
const newUntracked = untracked.filter(n => !baseline.untracked.includes(n));

console.log(`Local migrations: ${local.size} · Applied on remote: ${remote.size}`);
console.log(`Baseline drift (accepted): ${baseline.unapplied.length} unapplied, ${baseline.untracked.length} untracked\n`);

if (newUnapplied.length) {
  console.error('✗ NEW unapplied migrations (in repo but never applied to remote):');
  for (const n of newUnapplied) console.error(`    ${n}`);
  console.error('  → apply them, or run with --update-baseline if intentional\n');
}
if (newUntracked.length) {
  console.error('✗ NEW untracked remote migrations (applied to remote, no file in repo):');
  for (const n of newUntracked) console.error(`    ${n}`);
  console.error('  → mirror them into supabase/migrations/\n');
}

if (newUnapplied.length || newUntracked.length) process.exit(1);
console.log('✓ No new migration drift.');

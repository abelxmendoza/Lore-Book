#!/usr/bin/env node
/**
 * Apply pending migrations to the isolated staging Supabase database only.
 *
 * Usage: npm run staging:migrate
 *
 * Hard rules:
 *  - Never loads root `.env`
 *  - Refuses production project refs / hosts
 *  - Applies SQL files in repository order
 *  - Records versions in supabase_migrations.schema_migrations
 *
 * Exit 0 = critical migrations present
 * Exit 2 = safety failure or critical migration missing
 */
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import {
  loadStagingEnv,
  requireStagingIdentity,
  looksLikeProduction,
  STAGING_ROOT,
} from './lib/staging-env.mjs';

const CRITICAL = [
  '20260711120000',
  '20260711130000',
  '20260711140000',
  '20260711150000',
];

const env = loadStagingEnv();
const identity = requireStagingIdentity(env);

if (!identity.ok) {
  console.error('NO-GO: staging identity failed');
  for (const i of identity.issues) console.error(' -', i);
  process.exit(2);
}

const db = identity.staging.databaseUrl;
if (!db) {
  console.error('NO-GO: STAGING_DATABASE_URL required');
  process.exit(2);
}
if (looksLikeProduction(db) || /cshtthzpgkmrbcsfghyq/i.test(db) || /lorebookai/i.test(db)) {
  console.error('NO-GO: database URL looks like production');
  process.exit(2);
}

const expectedRef = env.STAGING_SUPABASE_PROJECT_REF || 'madyqnyvlexmpphejqmh';
if (!db.includes(expectedRef) && !db.includes('pooler.supabase.com')) {
  // pooler host may not include project ref in hostname the same way; require ref in user or query
  if (!db.includes(expectedRef)) {
    console.error('NO-GO: STAGING_DATABASE_URL does not contain expected staging project ref');
    process.exit(2);
  }
}

function psql(args, opts = {}) {
  return spawnSync('psql', [db, ...args], {
    encoding: 'utf8',
    timeout: opts.timeout ?? 120000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlc(sql, stop = true) {
  return psql(['-v', stop ? 'ON_ERROR_STOP=1' : 'ON_ERROR_STOP=0', '-c', sql]);
}

console.log('=== Staging migrate ===');
console.log('Target host:', identity.staging.dbHost);
console.log('Project ref expected:', expectedRef);
console.log('Production markers: rejected');

// Preflight identity again
const who = psqlc('SELECT current_database(), inet_server_addr()::text;');
if (who.status !== 0) {
  console.error('NO-GO: cannot connect to staging database');
  console.error(who.stderr?.slice(0, 300));
  process.exit(2);
}
console.log('Connected:', who.stdout.trim().split('\n')[0]);

// Ensure migrations schema
psqlc(
  `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
   CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
     version text PRIMARY KEY,
     name text,
     statements text[],
     created_by text,
     idempotency_key text,
     statements_applied int,
     rolled_back_at timestamptz
   );`,
  false,
);

const list = psqlc('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;');
const applied = new Set(
  (list.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l)),
);
console.log('Already applied:', applied.size);

const migDir = join(STAGING_ROOT, 'supabase/migrations');
const files = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// Fast path: if critical versions are already recorded, only apply missing critical
// files (and optionally full backlog when STAGING_MIGRATE_FULL=1).
const missingCritical = CRITICAL.filter((v) => !applied.has(v));
const fullBacklog = process.env.STAGING_MIGRATE_FULL === '1';
const targets = fullBacklog
  ? files
  : missingCritical.length
    ? files.filter((f) => CRITICAL.includes(f.split('_')[0]) || !applied.has(f.split('_')[0]))
    : [];

// When critical already applied and not doing full backlog, skip bulk re-apply of
// historically broken greenfield migrations.
if (!missingCritical.length && !fullBacklog) {
  console.log(
    'Critical migrations already recorded; skipping non-critical backlog (set STAGING_MIGRATE_FULL=1 to force).',
  );
}

let ok = 0;
let fail = 0;
let skip = 0;
const failedCritical = [];
const appliedCritical = [];

const iterate = !missingCritical.length && !fullBacklog ? [] : targets.length ? targets : files;

for (const file of files) {
  const ver = file.split('_')[0];
  if (applied.has(ver)) {
    skip += 1;
    if (CRITICAL.includes(ver)) appliedCritical.push(file);
  }
}

for (const file of iterate) {
  const ver = file.split('_')[0];
  const name = file.slice(ver.length + 1).replace(/\.sql$/, '');
  if (applied.has(ver)) {
    continue;
  }

  const r = psql(['-v', 'ON_ERROR_STOP=0', '-f', join(migDir, file)], {
    timeout: 180000,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const hasError = /\bERROR\b/.test(out);

  if (!hasError) {
    psqlc(
      `INSERT INTO supabase_migrations.schema_migrations(version, name)
       VALUES ('${ver}', '${name.replace(/'/g, "''")}')
       ON CONFLICT (version) DO NOTHING;`,
      false,
    );
    applied.add(ver);
    ok += 1;
    if (CRITICAL.includes(ver)) {
      appliedCritical.push(file);
      console.log('CRITICAL_OK', file);
    }
  } else {
    fail += 1;
    const errLine = out
      .split('\n')
      .filter((l) => l.includes('ERROR'))
      .slice(0, 1)
      .join(' ');
    if (CRITICAL.includes(ver) || process.env.STAGING_MIGRATE_VERBOSE === '1') {
      console.log('FAIL', file, '|', errLine.slice(0, 180));
    }
    if (CRITICAL.includes(ver)) failedCritical.push(file);
  }
}

console.log('SUMMARY ok', ok, 'fail', fail, 'skip', skip);

// Validate critical objects
const validate = psqlc(`
SELECT
  to_regclass('public.ingestion_jobs') AS ingestion_jobs,
  to_regclass('public.autobiographical_meaning_artifacts') AS meaning_artifacts,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'ingestion_jobs'
  ) AS ingestion_jobs_indexed,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'autobiographical_meaning_artifacts'
  ) AS meaning_has_policy;
`);
console.log('Schema check:\n' + (validate.stdout || validate.stderr || ''));

const t2 = spawnSync(
  'psql',
  [
    db,
    '-tAc',
    `SELECT
       CASE WHEN to_regclass('public.ingestion_jobs') IS NOT NULL THEN 'yes' ELSE 'no' END || ',' ||
       CASE WHEN to_regclass('public.autobiographical_meaning_artifacts') IS NOT NULL THEN 'yes' ELSE 'no' END;`,
  ],
  { encoding: 'utf8', timeout: 30000 },
);
const parts = String(t2.stdout || '')
  .trim()
  .split(',')
  .map((s) => s.trim());
const jobsOk = parts[0] === 'yes';
const meaningOk = parts[1] === 'yes';

console.log('ingestion_jobs:', jobsOk ? 'present' : 'MISSING');
console.log('autobiographical_meaning_artifacts:', meaningOk ? 'present' : 'MISSING');
console.log('CRITICAL_FAILED:', failedCritical.length ? failedCritical.join(', ') : 'none');

if (!jobsOk || !meaningOk || failedCritical.length) {
  console.error('\nNO-GO: critical staging schema incomplete');
  process.exit(2);
}

console.log('\nOK: staging migrations applied; critical schema present.');
process.exit(0);

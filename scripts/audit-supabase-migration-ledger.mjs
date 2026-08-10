#!/usr/bin/env node
/**
 * Read-only Supabase migration-ledger audit.
 *
 * Usage:
 *   node scripts/audit-supabase-migration-ledger.mjs
 *   node scripts/audit-supabase-migration-ledger.mjs --remote-json /path/to/rows.json
 *   supabase migration list --output json | node scripts/audit-supabase-migration-ledger.mjs --remote-stdin
 *
 * By default, reads the remote ledger with DATABASE_URL or
 * SUPABASE_CONNECTION_STRING. The JSON form accepts either an array of
 * {version, name} rows or the Supabase CLI migration-list JSON shape.
 * This script never writes to the database or migration files.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  auditMigrationLedger,
  readLocalMigrations,
} from './lib/migrationLedgerAudit.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const migrationsDirectory = resolve(root, 'supabase/migrations');

function loadEnv() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalizeJsonRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.migrations)) return input.migrations;
  if (Array.isArray(input?.remote)) return input.remote;
  throw new Error('Remote JSON must be an array or contain a migrations/remote array.');
}

async function readRemoteRows() {
  if (process.argv.includes('--remote-stdin')) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    if (!input.trim()) throw new Error('No migration ledger JSON was received on stdin.');
    return normalizeJsonRows(JSON.parse(input));
  }
  const jsonPath = optionValue('--remote-json');
  if (jsonPath) {
    return normalizeJsonRows(JSON.parse(readFileSync(resolve(jsonPath), 'utf8')));
  }

  loadEnv();
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_CONNECTION_STRING;
  if (!rawUrl) {
    throw new Error(
      'Set DATABASE_URL/SUPABASE_CONNECTION_STRING or pass --remote-json. No database writes are performed.',
    );
  }

  const connection = rawUrl.replace(/\?.*$/, '');
  const sql = postgres(connection, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  try {
    return await sql`
      select version, coalesce(name, '') as name
      from supabase_migrations.schema_migrations
      order by version
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printRows(title, rows, describe) {
  console.log(`\n${title} (${rows.length})`);
  for (const row of rows) console.log(`  ${describe(row)}`);
}

try {
  const local = readLocalMigrations(migrationsDirectory);
  const remote = await readRemoteRows();
  const result = auditMigrationLedger(local, remote);

  console.log(`Local files: ${local.length} · Remote ledger rows: ${remote.length}`);
  console.log(`Exact version matches: ${result.exact.length}`);

  printRows('Same name, different timestamp', result.retimestamped, ({ remote: r, local: l }) =>
    `${r.version} ${r.name} -> ${l.filename}`,
  );
  printRows('Malformed remote versions', result.malformedRemote, (row) =>
    `${row.version}${row.name ? ` (${row.name})` : ''}${row.duplicatesCanonicalVersion ? ' [duplicates canonical row]' : ''}`,
  );
  printRows('Ambiguous local mappings', result.ambiguousMappings, ({ remote: row, candidates }) =>
    `${row.version}${row.name ? ` ${row.name}` : ''} -> ${candidates.map((candidate) => candidate.filename).join(', ')}`,
  );
  printRows('Remote-only migrations', result.remoteOnly, (row) =>
    `${row.version}${row.name ? ` ${row.name}` : ''}`,
  );
  printRows('Local-only migrations', result.localOnly, (row) => row.filename);

  if (!result.safeForAutomaticPush) {
    console.error('\nFAIL: migration history needs reconciliation before db push or branch creation.');
    process.exitCode = 1;
  } else {
    console.log('\nPASS: no unsafe remote-history mismatch detected.');
  }
} catch (error) {
  console.error(`Migration ledger audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

#!/usr/bin/env npx tsx
/**
 * Run base migrations without psql (uses Node pg client).
 * Usage from repo root:
 *   npx tsx scripts/run-base-migrations.ts
 *   npm run migrate:base
 *
 * Requires in .env (project root):
 *   SUPABASE_CONNECTION_STRING = Session pooler URI (IPv4-safe).
 *   Format: postgresql://postgres:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
 *   Get from: Supabase Dashboard → Settings → Database → Connection string (URI) → Session mode.
 *   pg client uses ssl.rejectUnauthorized=false for pooler (Supabase internal CA).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env from project root; assert SUPABASE_CONNECTION_STRING exists
function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

dns.setDefaultResultOrder('ipv4first');

function getConnectionString(): string {
  const conn = process.env.SUPABASE_CONNECTION_STRING;
  if (conn === undefined || conn === '') {
    throw new Error('SUPABASE_CONNECTION_STRING not set. Add Session pooler URI to .env (see blueprint).');
  }
  if (!conn.startsWith('postgres')) {
    throw new Error('SUPABASE_CONNECTION_STRING must be a postgresql:// or postgres:// URI.');
  }
  const u = new URL(conn.replace(/^postgresql:/i, 'postgres:'));
  if (!/pooler/i.test(u.hostname)) {
    throw new Error(
      'Hostname must contain "pooler" (Session pooler URI). ' +
      'Get URI from: Supabase Dashboard → Settings → Database → Connection string (URI) → Session mode.'
    );
  }
  if (/2600:|\[[0-9a-f:]+]/i.test(conn)) {
    throw new Error('IPv6 literal in URI — use Session pooler hostname (e.g. aws-0-<region>.pooler.supabase.com).');
  }
  return conn;
}

async function run(): Promise<void> {
  const { Client } = await import('pg');
  const baseMigrations = [
    'migrations/000_setup_all_tables.sql',
    'migrations/20250102_conversational_orchestration.sql',
  ];

  let connectionString: string;
  try {
    connectionString = getConnectionString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\n❌', msg);
    console.error('\nExpected format in .env (Session pooler only):');
    console.error('  SUPABASE_CONNECTION_STRING=postgresql://postgres:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require');
    console.error('  Copy from: Supabase Dashboard → Settings → Database → Connection string (URI) → Session mode.');
    process.exit(1);
  }

  // Pooler uses internal CA; Node TLS rejects by default. ssl.rejectUnauthorized=false is required (blueprint).
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Migration failed:', msg);
    process.exit(1);
  }

  try {
    console.log('Running', baseMigrations.length, 'base migration(s)...\n');

    for (const rel of baseMigrations) {
      const path = join(ROOT, rel);
      if (!existsSync(path)) {
        console.warn('  ⚠ Not found:', rel);
        continue;
      }
      console.log('  →', rel);
      const sql = readFileSync(path, 'utf-8');
      await client.query(sql);
      console.log('  ✅', rel);
    }

    console.log('\nDone.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Migration failed:', msg);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

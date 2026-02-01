#!/usr/bin/env npx tsx
/**
 * Lore-Book Migration Bootstrap (IPv4 + SSL-safe).
 * Usage from repo root: npx tsx scripts/run-base-migrations.ts  OR  npm run migrate:base
 *
 * Preconditions: Node >= 18, npm deps installed, .env with SUPABASE_CONNECTION_STRING.
 * Connection string: Session pooler URI only (host must contain pooler.supabase.com).
 * Do NOT include sslmode= in the URI — SSL is configured in code (rejectUnauthorized: false).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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
    throw new Error('Missing connection string. Set SUPABASE_CONNECTION_STRING in .env.');
  }
  if (!conn.startsWith('postgres')) {
    throw new Error('SUPABASE_CONNECTION_STRING must be a postgresql:// or postgres:// URI.');
  }
  if (/sslmode=/i.test(conn)) {
    throw new Error('Invalid URI: remove sslmode from connection string. SSL is configured in code.');
  }
  const u = new URL(conn.replace(/^postgresql:/i, 'postgres:'));
  if (!u.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('Invalid host: must use Session pooler. Host must end with .pooler.supabase.com');
  }
  if (/2600:|\[[0-9a-f:]+]/i.test(conn)) {
    throw new Error('IPv6 literal in URI — use Session pooler hostname (e.g. aws-0-<region>.pooler.supabase.com).');
  }
  return conn;
}

/** Parse pooler URI so user/password are correct (URI parsers often split on first : and break postgres.project_ref:password). */
function parsePoolerConfig(connectionString: string): { user: string; password: string; host: string; port: number; database: string } {
  const uri = connectionString.replace(/^postgresql:/i, 'postgres:');
  const u = new URL(uri);
  const userinfo = u.username ? `${u.username}${u.password ? ':' + u.password : ''}` : '';
  const at = connectionString.indexOf('@');
  const authorityStart = connectionString.indexOf('//') + 2;
  const rawUserinfo = at > authorityStart ? connectionString.slice(authorityStart, at) : userinfo;
  const colonIdx = rawUserinfo.indexOf(':');
  let user: string;
  let password: string;
  if (colonIdx === -1) {
    user = decodeURIComponent(rawUserinfo);
    password = '';
  } else {
    const before = rawUserinfo.slice(0, colonIdx);
    const after = rawUserinfo.slice(colonIdx + 1);
    if (before === 'postgres' && /^[a-zA-Z0-9_-]+:/.test(after)) {
      const secondColon = after.indexOf(':');
      user = 'postgres.' + after.slice(0, secondColon);
      password = decodeURIComponent(after.slice(secondColon + 1));
    } else {
      user = decodeURIComponent(before);
      password = decodeURIComponent(after);
    }
  }
  return {
    user,
    password,
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: (u.pathname || '/postgres').slice(1) || 'postgres',
  };
}

async function run(): Promise<void> {
  const { Pool } = await import('pg');
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
    console.error('\nExpected in .env (no sslmode in URI):');
    console.error('  SUPABASE_CONNECTION_STRING=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres');
    console.error('  Copy from: Supabase Dashboard → Settings → Database → Connection string (URI) → Session mode.');
    process.exit(1);
  }

  const config = parsePoolerConfig(connectionString);
  const pool = new Pool({
    ...config,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENETUNREACH/i.test(msg)) {
      console.error('\n❌ IPv6 unreachable → use Session Pooler URI in .env');
    } else if (/self-signed certificate/i.test(msg)) {
      console.error('\n❌ SSL precedence error → SSL must be configured in code, not URI. Remove sslmode= from SUPABASE_CONNECTION_STRING.');
    } else if (/tenant or user not found/i.test(msg)) {
      console.error('\n❌ Tenant or user not found → password in URI does not match Supabase.');
      console.error('   Fix: Supabase Dashboard → Settings → Database → use "Reset database password" if needed.');
      console.error('   Then copy the connection URI (Session mode) and set SUPABASE_CONNECTION_STRING in .env to that URI (remove ?sslmode= from end).');
    } else if (/password authentication failed/i.test(msg)) {
      console.error('\n❌ Password authentication failed → the password in SUPABASE_CONNECTION_STRING is wrong.');
      console.error('   Fix: Supabase Dashboard → Settings → Database → "Reset database password" → copy the NEW password.');
      console.error('   Update .env: replace the password in SUPABASE_CONNECTION_STRING (between the first : and @) with the new password.');
    } else {
      console.error('\n❌ Migration failed:', msg);
    }
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
      await pool.query(sql);
      console.log('  ✅', rel);
    }
    console.log('\nMigrations complete.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant or user not found/i.test(msg)) {
      console.error('\n❌ Tenant or user not found → password in URI does not match Supabase.');
      console.error('   Fix: Supabase Dashboard → Settings → Database → reset DB password, then set SUPABASE_CONNECTION_STRING in .env to the new URI (Session mode, no ?sslmode=).');
    } else if (/password authentication failed/i.test(msg)) {
      console.error('\n❌ Password authentication failed → wrong password in SUPABASE_CONNECTION_STRING.');
      console.error('   Fix: Supabase Dashboard → Settings → Database → Reset database password → put the NEW password in .env (in the URI between : and @).');
    } else {
      console.error('\n❌ Migration failed:', msg);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

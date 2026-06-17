#!/usr/bin/env npx tsx
/**
 * Apply spatial + social ontology migrations directly to Supabase.
 * Usage: npx tsx scripts/run-ontology-migrations.ts
 * Requires SUPABASE_CONNECTION_STRING in .env (Session pooler URI).
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
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();
dns.setDefaultResultOrder('ipv4first');

const MIGRATIONS = [
  'supabase/migrations/20260617120000_spatial_ontology.sql',
  'supabase/migrations/20260617130000_social_group_ontology.sql',
  'supabase/migrations/20260617140000_organizations_type_check.sql',
  'supabase/migrations/20260617140000_romantic_peripherals.sql',
  'supabase/migrations/20260617150000_user_inference_state.sql',
  'supabase/migrations/20260617160000_dynamic_classifications.sql',
  'supabase/migrations/20260617170000_classifications_swimlane_keywords.sql',
  'supabase/migrations/20260617180000_relationship_scope_classifications.sql',
  'supabase/migrations/20260617210000_entity_authority.sql',
];

function getConnectionString(): string {
  let conn = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) throw new Error('Set SUPABASE_CONNECTION_STRING or DATABASE_URL in .env');
  conn = conn.replace(/\?.*$/, '').replace(/&sslmode=[^&]*/gi, '');
  if (/sslmode=/i.test(conn)) throw new Error('Remove sslmode= from connection string');
  return conn;
}

function parsePoolerConfig(connectionString: string) {
  const uri = connectionString.replace(/^postgresql:/i, 'postgres:');
  const u = new URL(uri);
  const at = connectionString.indexOf('@');
  const authorityStart = connectionString.indexOf('//') + 2;
  const rawUserinfo = at > authorityStart ? connectionString.slice(authorityStart, at) : `${u.username}:${u.password}`;
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
  const config = parsePoolerConfig(getConnectionString());
  const pool = new Pool({ ...config, ssl: { rejectUnauthorized: false } });

  try {
    await pool.query('SELECT 1');
    console.log('Connected. Applying ontology migrations...\n');
    for (const rel of MIGRATIONS) {
      const path = join(ROOT, rel);
      if (!existsSync(path)) {
        console.warn('  ⚠ Not found:', rel);
        continue;
      }
      console.log('  →', rel);
      await pool.query(readFileSync(path, 'utf-8'));
      console.log('  ✅', rel);
    }
    console.log('\n✅ Ontology migrations applied.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

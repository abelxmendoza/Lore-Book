#!/usr/bin/env npx tsx
/** Apply relationship_peripherals domain generalization migration. */
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

async function run(): Promise<void> {
  loadEnv();
  dns.setDefaultResultOrder('ipv4first');
  const conn = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) throw new Error('Set DATABASE_URL in .env');

  const path = join(ROOT, 'supabase/migrations/20260617180000_relationship_peripherals_domain.sql');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: conn.replace(/\?.*$/, ''), ssl: { rejectUnauthorized: false } });

  try {
    await pool.query('SELECT 1');
    console.log('Applying relationship_peripherals domain migration...');
    await pool.query(readFileSync(path, 'utf-8'));
    const verify = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'relationship_peripherals' AND column_name = 'domain'
    `);
    console.log('✅ Done. domain column:', verify.rows.length > 0);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

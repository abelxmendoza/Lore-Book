#!/usr/bin/env npx tsx
/**
 * Apply romantic_peripherals migration to Supabase.
 * Usage: npx tsx scripts/run-romantic-peripherals-migration.ts
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

async function run(): Promise<void> {
  loadEnv();
  dns.setDefaultResultOrder('ipv4first');

  const conn = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) throw new Error('Set SUPABASE_CONNECTION_STRING or DATABASE_URL in .env');

  const migrationPath = join(ROOT, 'supabase/migrations/20260617140000_romantic_peripherals.sql');
  if (!existsSync(migrationPath)) throw new Error(`Migration not found: ${migrationPath}`);

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: conn.replace(/\?.*$/, ''),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query('SELECT 1');
    console.log('Connected.');

    const exists = await pool.query(
      `SELECT to_regclass('public.romantic_peripherals') AS tbl`
    );
    if (exists.rows[0]?.tbl) {
      console.log('✅ romantic_peripherals already exists — skipping CREATE (idempotent).');
    } else {
      console.log('Applying romantic_peripherals migration...');
      await pool.query(readFileSync(migrationPath, 'utf-8'));
      console.log('✅ Migration applied.');
    }

    const verify = await pool.query(`
      SELECT
        to_regclass('public.romantic_peripherals') AS table_name,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'romantic_peripherals') AS column_count,
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'romantic_peripherals') AS rls_enabled,
        (SELECT count(*)::int FROM pg_policies WHERE tablename = 'romantic_peripherals') AS policy_count
    `);
    console.log('Verify:', verify.rows[0]);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

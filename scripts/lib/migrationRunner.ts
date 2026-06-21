/**
 * Shared migration-runner primitives.
 *
 * Consolidates the env-loading, Session-pooler URI parsing, and `pg` apply loop
 * that used to be copy-pasted across run-base-migrations / run-ontology-migrations /
 * run-relationship-peripherals / run-romantic-peripherals. The single entrypoint
 * that uses this is `scripts/migrate.ts`.
 *
 * Connection: Session pooler URI in `SUPABASE_CONNECTION_STRING` (or `DATABASE_URL`).
 * Do NOT put `sslmode=` in the URI — it is stripped automatically; SSL is configured in code (rejectUnauthorized:false).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import dns from 'dns';
import type { Pool } from 'pg';

/** Minimal .env loader — does not override already-set process env vars. */
export function loadEnv(root: string): void {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export interface PoolConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

/**
 * Resolve and validate the connection string.
 * @param requirePooler when true (the default for `base`), enforces the Session
 *   pooler host + rejects IPv6 literals so misconfig fails fast with guidance.
 */
export function getConnectionString(opts: { requirePooler?: boolean } = {}): string {
  let conn = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('Set SUPABASE_CONNECTION_STRING (or DATABASE_URL) in .env');
  }
  if (!conn.startsWith('postgres')) {
    throw new Error('Connection string must be a postgresql:// or postgres:// URI.');
  }
  // Strip query string (including sslmode) — Pool sets ssl explicitly below.
  conn = conn.replace(/\?.*$/, '');
  if (opts.requirePooler) {
    const u = new URL(conn.replace(/^postgresql:/i, 'postgres:'));
    if (!u.hostname.endsWith('.pooler.supabase.com')) {
      throw new Error('Host must use the Session pooler (…pooler.supabase.com).');
    }
    if (/2600:|\[[0-9a-f:]+]/i.test(conn)) {
      throw new Error('IPv6 literal in URI — use the Session pooler hostname instead.');
    }
  }
  return conn;
}

/**
 * Parse a pooler URI into discrete fields. Plain URL parsing breaks the
 * `postgres.<project_ref>:<password>` userinfo shape, so handle it explicitly.
 */
export function parsePoolerConfig(connectionString: string): PoolConfig {
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

/** Translate common low-level pg errors into actionable guidance. */
function explainConnectionError(msg: string): string {
  if (/ENETUNREACH/i.test(msg)) return 'IPv6 unreachable → use the Session Pooler URI in .env.';
  if (/self-signed certificate/i.test(msg))
    return 'SSL precedence error → remove sslmode= from the URI (SSL is set in code).';
  if (/tenant or user not found/i.test(msg))
    return 'Tenant/user not found → the password in the URI does not match Supabase. Reset the DB password and update .env.';
  if (/password authentication failed/i.test(msg))
    return 'Password authentication failed → wrong password in SUPABASE_CONNECTION_STRING. Reset the DB password and update .env.';
  return msg;
}

export interface MigrationItem {
  /** Path relative to repo root. */
  file: string;
  /** Optional idempotency guard — return true to skip applying this file. */
  skipIf?: (pool: Pool) => Promise<boolean>;
}

/**
 * Derive the `(version, name)` identity for a migration file. `name` matches the
 * slug used by scripts/check-migration-drift.mjs (the part after the numeric
 * prefix), so recordings here are visible to the drift check. `version` is the
 * file's numeric prefix when present (stable + idempotent), otherwise an
 * apply-time timestamp.
 */
export function parseMigrationIdentity(file: string): { version: string; name: string } {
  const base = (file.split('/').pop() ?? file).replace(/\.sql$/i, '');
  const m = base.match(/^(\d+)_?(.*)$/);
  if (m && m[1]) {
    return { version: m[1], name: m[2] || m[1] };
  }
  const version = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return { version, name: base };
}

/**
 * Record an applied migration in `supabase_migrations.schema_migrations` (the
 * same table `public.applied_migrations()` reads) so the drift check can see it.
 * Best-effort: a recording failure must not fail an already-applied migration.
 */
async function recordMigration(pool: Pool, file: string): Promise<void> {
  const { version, name } = parseMigrationIdentity(file);
  try {
    // Dedup by NAME — that's what check-migration-drift.mjs matches on.
    const already = await pool.query(
      'select 1 from supabase_migrations.schema_migrations where name = $1 limit 1',
      [name],
    );
    if (already.rows.length) return;

    // `version` is the table's primary key, but different migration files can
    // share a numeric prefix, so pick a version that isn't taken yet.
    let candidate = version;
    for (let i = 1; ; i += 1) {
      const taken = await pool.query(
        'select 1 from supabase_migrations.schema_migrations where version = $1 limit 1',
        [candidate],
      );
      if (!taken.rows.length) break;
      candidate = `${version}_${name}${i > 1 ? `_${i}` : ''}`.slice(0, 255);
    }

    await pool.query(
      'insert into supabase_migrations.schema_migrations (version, name, created_by) values ($1, $2, $3)',
      [candidate, name, 'scripts/migrate.ts'],
    );
  } catch (err) {
    console.warn(
      `  ⚠ Applied but failed to record in schema_migrations (${name}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export interface ApplyOptions {
  /** Repo root (absolute). */
  root: string;
  /** Human label for logging, e.g. "ontology". */
  label: string;
  /** Migrations to apply, in order. */
  migrations: MigrationItem[];
  /** Enforce the Session pooler host (default false; `base` sets true). */
  requirePooler?: boolean;
  /** Optional verification run once after all files apply. */
  verify?: (pool: Pool) => Promise<void>;
}

/**
 * Apply a set of migrations against the configured pooler connection.
 * Owns the full pool lifecycle (connect → probe → apply → verify → end).
 */
export async function applyMigrations(opts: ApplyOptions): Promise<void> {
  dns.setDefaultResultOrder('ipv4first');

  const connectionString = getConnectionString({ requirePooler: opts.requirePooler });
  const config = parsePoolerConfig(connectionString);

  const { Pool } = await import('pg');
  const pool = new Pool({ ...config, ssl: { rejectUnauthorized: false } });

  try {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      throw new Error(explainConnectionError(err instanceof Error ? err.message : String(err)));
    }

    console.log(`Connected. Applying ${opts.migrations.length} ${opts.label} migration(s)...\n`);
    for (const item of opts.migrations) {
      const path = join(opts.root, item.file);
      if (!existsSync(path)) {
        console.warn('  ⚠ Not found:', item.file);
        continue;
      }
      if (item.skipIf && (await item.skipIf(pool))) {
        console.log('  ⏭  Skipped (already applied):', item.file);
        continue;
      }
      console.log('  →', item.file);
      await pool.query(readFileSync(path, 'utf-8'));
      await recordMigration(pool, item.file);
      console.log('  ✅', item.file);
    }

    if (opts.verify) await opts.verify(pool);
    console.log(`\n✅ ${opts.label} migrations complete.`);
  } catch (err) {
    throw new Error(explainConnectionError(err instanceof Error ? err.message : String(err)));
  } finally {
    await pool.end();
  }
}

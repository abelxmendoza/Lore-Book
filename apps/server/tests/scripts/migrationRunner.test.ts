import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Unit + integration tests for the consolidated migration runner that replaced
 * the four copy-pasted run-*-migration scripts.
 *
 * Unit: pure parsing/validation (parsePoolerConfig, getConnectionString, loadEnv).
 * Integration: applyMigrations against a mocked `pg` Pool, covering ordering,
 * idempotency (skipIf), verify hooks, missing-file warnings, and error translation.
 */

// `applyMigrations` does `await import('pg')`; mock it so no real DB is touched.
const pgState = vi.hoisted(() => {
  type Handler = (sql: string) => unknown;
  const calls: string[] = [];
  let handler: Handler = () => ({ rows: [] });
  let connectShouldThrow: Error | null = null;
  const query = vi.fn(async (sql: string) => {
    if (sql === 'SELECT 1' && connectShouldThrow) throw connectShouldThrow;
    calls.push(sql);
    return handler(sql);
  });
  const end = vi.fn(async () => undefined);
  const Pool = vi.fn(function () {
    return { query, end };
  });
  return {
    Pool,
    query,
    end,
    calls,
    setHandler: (h: Handler) => {
      handler = h;
    },
    failConnect: (e: Error | null) => {
      connectShouldThrow = e;
    },
    reset: () => {
      calls.length = 0;
      handler = () => ({ rows: [] });
      connectShouldThrow = null;
      query.mockClear();
      end.mockClear();
      Pool.mockClear();
    },
  };
});

vi.mock('pg', () => ({ Pool: pgState.Pool, default: { Pool: pgState.Pool } }));

import {
  parsePoolerConfig,
  getConnectionString,
  loadEnv,
  applyMigrations,
} from '../../../../scripts/lib/migrationRunner';

const POOLER_URI =
  'postgresql://postgres.abcdefghijklmnop:s3cr3t%40pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

describe('migrationRunner — parsePoolerConfig (unit)', () => {
  it('parses the postgres.<project_ref>:<password> userinfo shape correctly', () => {
    const cfg = parsePoolerConfig(POOLER_URI);
    expect(cfg.user).toBe('postgres.abcdefghijklmnop');
    expect(cfg.password).toBe('s3cr3t@pass'); // percent-decoded
    expect(cfg.host).toBe('aws-0-us-east-1.pooler.supabase.com');
    expect(cfg.port).toBe(5432);
    expect(cfg.database).toBe('postgres');
  });

  it('parses a plain user:password URI', () => {
    const cfg = parsePoolerConfig('postgres://alice:wonderland@db.example.com:6543/mydb');
    expect(cfg.user).toBe('alice');
    expect(cfg.password).toBe('wonderland');
    expect(cfg.host).toBe('db.example.com');
    expect(cfg.port).toBe(6543);
    expect(cfg.database).toBe('mydb');
  });

  it('handles a userinfo with no password', () => {
    const cfg = parsePoolerConfig('postgres://postgres@localhost/postgres');
    expect(cfg.user).toBe('postgres');
    expect(cfg.password).toBe('');
    expect(cfg.port).toBe(5432); // default
  });

  it('defaults the database to postgres when the path is empty', () => {
    const cfg = parsePoolerConfig('postgres://u:p@host:5432/');
    expect(cfg.database).toBe('postgres');
  });
});

describe('migrationRunner — getConnectionString (unit)', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    delete process.env.SUPABASE_CONNECTION_STRING;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('throws when neither SUPABASE_CONNECTION_STRING nor DATABASE_URL is set', () => {
    expect(() => getConnectionString()).toThrow(/SUPABASE_CONNECTION_STRING/);
  });

  it('rejects a non-postgres URI', () => {
    process.env.SUPABASE_CONNECTION_STRING = 'mysql://u:p@host/db';
    expect(() => getConnectionString()).toThrow(/postgresql:\/\/ or postgres:\/\//);
  });

  it('rejects a URI that embeds sslmode', () => {
    process.env.SUPABASE_CONNECTION_STRING = `${POOLER_URI}?sslmode=require`;
    expect(() => getConnectionString()).toThrow(/Remove sslmode=/);
  });

  it('strips a trailing query string', () => {
    process.env.SUPABASE_CONNECTION_STRING = `${POOLER_URI}?foo=bar`;
    expect(getConnectionString()).toBe(POOLER_URI);
  });

  it('falls back to DATABASE_URL', () => {
    process.env.DATABASE_URL = POOLER_URI;
    expect(getConnectionString()).toBe(POOLER_URI);
  });

  describe('requirePooler', () => {
    it('rejects a non-pooler host', () => {
      process.env.SUPABASE_CONNECTION_STRING = 'postgres://u:p@db.supabase.co:5432/postgres';
      expect(() => getConnectionString({ requirePooler: true })).toThrow(/Session pooler/);
    });

    it('accepts a valid pooler host', () => {
      process.env.SUPABASE_CONNECTION_STRING = POOLER_URI;
      expect(getConnectionString({ requirePooler: true })).toBe(POOLER_URI);
    });

    it('rejects an IPv6 literal host', () => {
      process.env.SUPABASE_CONNECTION_STRING =
        'postgres://u:p@[2600:1f16:abcd::1].pooler.supabase.com:5432/postgres';
      expect(() => getConnectionString({ requirePooler: true })).toThrow();
    });
  });
});

describe('migrationRunner — loadEnv (unit)', () => {
  let dir: string;
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loadenv-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...ORIGINAL };
  });

  it('parses keys, ignores comments/blank lines, and strips quotes', () => {
    writeFileSync(
      join(dir, '.env'),
      ['# comment', '', 'FOO=bar', 'QUOTED="hello world"', "SINGLE='single'", 'NO_EQUALS_LINE'].join('\n'),
    );
    delete process.env.FOO;
    delete process.env.QUOTED;
    delete process.env.SINGLE;
    loadEnv(dir);
    expect(process.env.FOO).toBe('bar');
    expect(process.env.QUOTED).toBe('hello world');
    expect(process.env.SINGLE).toBe('single');
  });

  it('does not override already-set environment variables', () => {
    writeFileSync(join(dir, '.env'), 'ALREADY_SET=from_file');
    process.env.ALREADY_SET = 'from_process';
    loadEnv(dir);
    expect(process.env.ALREADY_SET).toBe('from_process');
  });

  it('is a no-op when no .env file exists', () => {
    expect(() => loadEnv(join(dir, 'does-not-exist'))).not.toThrow();
  });
});

describe('migrationRunner — applyMigrations (integration)', () => {
  let root: string;
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    pgState.reset();
    root = mkdtempSync(join(tmpdir(), 'apply-'));
    mkdirSync(join(root, 'sql'), { recursive: true });
    process.env.SUPABASE_CONNECTION_STRING = POOLER_URI;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.env = { ...ORIGINAL };
  });

  function writeSql(name: string, body: string): string {
    const rel = join('sql', name);
    writeFileSync(join(root, rel), body);
    return rel;
  }

  it('applies migrations in order after a connectivity probe', async () => {
    const a = writeSql('a.sql', 'CREATE TABLE a();');
    const b = writeSql('b.sql', 'CREATE TABLE b();');

    await applyMigrations({ root, label: 'test', migrations: [{ file: a }, { file: b }] });

    // First query is the SELECT 1 probe, then the two bodies in order.
    expect(pgState.calls[0]).toBe('SELECT 1');
    expect(pgState.calls).toContain('CREATE TABLE a();');
    expect(pgState.calls).toContain('CREATE TABLE b();');
    expect(pgState.calls.indexOf('CREATE TABLE a();')).toBeLessThan(
      pgState.calls.indexOf('CREATE TABLE b();'),
    );
    expect(pgState.end).toHaveBeenCalledOnce();
  });

  it('warns and skips a missing file without aborting the run', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const present = writeSql('present.sql', 'SELECT now();');

    await applyMigrations({
      root,
      label: 'test',
      migrations: [{ file: 'sql/missing.sql' }, { file: present }],
    });

    expect(warn).toHaveBeenCalledWith('  ⚠ Not found:', 'sql/missing.sql');
    expect(pgState.calls).toContain('SELECT now();');
    warn.mockRestore();
  });

  it('honors skipIf (idempotency) and never applies the body', async () => {
    const body = 'CREATE TABLE skip_me();';
    const f = writeSql('skip.sql', body);

    await applyMigrations({
      root,
      label: 'test',
      migrations: [{ file: f, skipIf: async () => true }],
    });

    expect(pgState.calls).not.toContain(body);
  });

  it('runs the verify hook after applying', async () => {
    const f = writeSql('v.sql', 'SELECT 1 AS ok;');
    const verify = vi.fn(async () => undefined);

    await applyMigrations({ root, label: 'test', migrations: [{ file: f }], verify });

    expect(verify).toHaveBeenCalledOnce();
  });

  it('translates an IPv6/ENETUNREACH connection failure into guidance', async () => {
    pgState.failConnect(new Error('connect ENETUNREACH 2600:1f16::1:5432'));
    const f = writeSql('x.sql', 'SELECT 1;');

    await expect(
      applyMigrations({ root, label: 'test', migrations: [{ file: f }] }),
    ).rejects.toThrow(/IPv6 unreachable/);
    // Pool must still be closed on failure.
    expect(pgState.end).toHaveBeenCalledOnce();
  });

  it('translates a password-authentication failure into guidance', async () => {
    pgState.failConnect(new Error('password authentication failed for user "postgres"'));
    const f = writeSql('x.sql', 'SELECT 1;');

    await expect(
      applyMigrations({ root, label: 'test', migrations: [{ file: f }] }),
    ).rejects.toThrow(/Password authentication failed/);
  });
});

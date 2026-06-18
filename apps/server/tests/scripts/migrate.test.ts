import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

/**
 * Unit + e2e tests for the unified `migrate.ts` dispatcher.
 *
 * Unit: resolveCommand maps each subcommand to the right migration list / hooks.
 * E2e: runMigrate('file', …) drives resolveCommand → applyMigrations → mocked pg.
 */

const pgState = vi.hoisted(() => {
  const calls: string[] = [];
  let handler: (sql: string) => unknown = () => ({ rows: [] });
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    return handler(sql);
  });
  const end = vi.fn(async () => undefined);
  const Pool = vi.fn(function () {
    return { query, end };
  });
  return {
    Pool,
    calls,
    setHandler: (h: (sql: string) => unknown) => {
      handler = h;
    },
    reset: () => {
      calls.length = 0;
      handler = () => ({ rows: [] });
      query.mockClear();
      end.mockClear();
      Pool.mockClear();
    },
  };
});

vi.mock('pg', () => ({ Pool: pgState.Pool, default: { Pool: pgState.Pool } }));

import {
  resolveCommand,
  runMigrate,
  ROOT,
  BASE_MIGRATIONS,
  ENGINE_MIGRATIONS,
  ONTOLOGY_MIGRATIONS,
} from '../../../../scripts/migrate';

describe('migrate — resolveCommand (unit)', () => {
  it('maps "base" to the base migrations and requires the pooler', async () => {
    const r = await resolveCommand(['base']);
    expect(r?.label).toBe('base');
    expect(r?.cmd.requirePooler).toBe(true);
    expect(r?.cmd.migrations.map((m) => m.file)).toEqual(BASE_MIGRATIONS);
  });

  it('maps "ontology" to the full ontology list', async () => {
    const r = await resolveCommand(['ontology']);
    expect(r?.label).toBe('ontology');
    expect(r?.cmd.migrations.map((m) => m.file)).toEqual(ONTOLOGY_MIGRATIONS);
    expect(r?.cmd.requirePooler).toBeUndefined();
  });

  it('maps "engine" to engine_results + engine_dependencies migrations', async () => {
    const r = await resolveCommand(['engine']);
    expect(r?.label).toBe('engine');
    expect(r?.cmd.migrations.map((m) => m.file)).toEqual(ENGINE_MIGRATIONS);
    expect(typeof r?.cmd.verify).toBe('function');
  });

  it('attaches a verify hook for relationship-peripherals', async () => {
    const r = await resolveCommand(['relationship-peripherals']);
    expect(r?.cmd.migrations).toHaveLength(1);
    expect(typeof r?.cmd.verify).toBe('function');
  });

  it('attaches a skipIf idempotency guard + verify for romantic-peripherals', async () => {
    const r = await resolveCommand(['romantic-peripherals']);
    expect(r?.cmd.migrations).toHaveLength(1);
    expect(typeof r?.cmd.migrations[0].skipIf).toBe('function');
    expect(typeof r?.cmd.verify).toBe('function');
  });

  it('maps "file" to the provided paths', async () => {
    const r = await resolveCommand(['file', 'a.sql', 'b.sql']);
    expect(r?.label).toBe('file');
    expect(r?.cmd.migrations.map((m) => m.file)).toEqual(['a.sql', 'b.sql']);
  });

  it('throws when "file" is given no paths', async () => {
    await expect(resolveCommand(['file'])).rejects.toThrow(/Usage: migrate.ts file/);
  });

  it('returns null for an unknown subcommand', async () => {
    expect(await resolveCommand(['wat'])).toBeNull();
    expect(await resolveCommand([])).toBeNull();
  });

  it('base/ontology/engine lists reference .sql files only', () => {
    for (const f of [...BASE_MIGRATIONS, ...ENGINE_MIGRATIONS, ...ONTOLOGY_MIGRATIONS]) {
      expect(f).toMatch(/\.sql$/);
    }
  });
});

describe('migrate — runMigrate (e2e)', () => {
  let dir: string;
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    pgState.reset();
    process.env.SUPABASE_CONNECTION_STRING =
      'postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
    dir = mkdtempSync(join(tmpdir(), 'migrate-e2e-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...ORIGINAL };
  });

  it('applies multiple files in order via the "file" subcommand', async () => {
    writeFileSync(join(dir, 'one.sql'), 'SELECT 1;');
    writeFileSync(join(dir, 'two.sql'), 'SELECT 2;');
    // applyMigrations resolves files as join(ROOT, file); pass paths relative to ROOT.
    const one = relative(ROOT, join(dir, 'one.sql'));
    const two = relative(ROOT, join(dir, 'two.sql'));

    await runMigrate(['file', one, two]);

    expect(pgState.calls[0]).toBe('SELECT 1'); // connectivity probe
    expect(pgState.calls).toContain('SELECT 1;');
    expect(pgState.calls).toContain('SELECT 2;');
    expect(pgState.calls.indexOf('SELECT 1;')).toBeLessThan(pgState.calls.indexOf('SELECT 2;'));
  });

  it('throws on an unknown subcommand', async () => {
    await expect(runMigrate(['nope'])).rejects.toThrow(/Usage: migrate.ts/);
  });
});

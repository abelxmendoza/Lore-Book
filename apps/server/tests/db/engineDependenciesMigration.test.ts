import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const supabaseMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260618090000_engine_dependencies.sql'
);
const legacyMigrationPath = resolve(repoRoot, 'migrations/20260618_engine_dependencies.sql');

function readSql(path: string): string {
  return readFileSync(path, 'utf8').toLowerCase();
}

describe('engine_dependencies migration', () => {
  it('creates the PostgREST table queried by DependencyGraph', () => {
    const sql = readSql(supabaseMigrationPath);

    expect(sql).toContain('create table if not exists public.engine_dependencies');
    expect(sql).toContain('engine_name text not null');
    expect(sql).toContain('depends_on text not null');
    expect(sql).toContain('primary key (engine_name, depends_on)');
  });

  it('enables RLS and restricts client roles', () => {
    const sql = readSql(supabaseMigrationPath);

    expect(sql).toContain('alter table public.engine_dependencies enable row level security');
    expect(sql).toContain('revoke all on table public.engine_dependencies from anon, authenticated');
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.engine_dependencies to service_role'
    );
  });

  it('keeps the legacy migration helper path in sync', () => {
    expect(readSql(legacyMigrationPath)).toBe(readSql(supabaseMigrationPath));
  });
});

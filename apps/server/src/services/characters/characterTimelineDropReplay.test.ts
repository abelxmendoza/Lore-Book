import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../');
const SQL = resolve(repoRoot, 'apps/server/scripts/replayCharacterTimelineDrop.sql');
const MIGRATION = resolve(
  repoRoot,
  'supabase/migrations/20260821194550_drop_character_timeline_events.sql',
);

function firstWorking(candidates: string[], args: string[]): string | null {
  for (const bin of candidates) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' });
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

function localPostgresBins() {
  return {
    initdb: firstWorking(
      ['initdb', '/opt/homebrew/bin/initdb', '/usr/local/bin/initdb'],
      ['--version'],
    ),
    pgCtl: firstWorking(
      ['pg_ctl', '/opt/homebrew/bin/pg_ctl', '/usr/local/bin/pg_ctl'],
      ['--version'],
    ),
    psql: firstWorking(
      ['psql', '/opt/homebrew/bin/psql', '/usr/local/bin/psql'],
      ['--version'],
    ),
    pgIsReady: firstWorking(
      ['pg_isready', '/opt/homebrew/bin/pg_isready', '/usr/local/bin/pg_isready'],
      ['--version'],
    ),
  };
}

const bins = localPostgresBins();
const hasLocalPostgres = Boolean(bins.initdb && bins.pgCtl && bins.psql && bins.pgIsReady);

describe('character_timeline_events DROP replay', () => {
  it('migration only drops character_timeline_events', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.character_timeline_events CASCADE/);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS public\.resolved_events/);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS public\.characters/);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS public\.entity_timeline_events/);
  });

  it.skipIf(!hasLocalPostgres)(
    'isolated Postgres replay keeps canonical people[] and allows Character delete',
    () => {

    const workdir = mkdtempSync(join(tmpdir(), 'cte-drop-replay-'));
    const dataDir = join(workdir, 'data');
    const port = String(55432 + (process.pid % 1000));
    try {
      execFileSync(bins.initdb!, ['-D', dataDir, '--auth=trust', '--no-sync', '-U', 'postgres'], { stdio: 'ignore' });
      execFileSync(bins.pgCtl!, [
        '-D', dataDir,
        '-o', `-p ${port} -k ${workdir} -c listen_addresses='' -c fsync=off -c synchronous_commit=off`,
        '-l', join(workdir, 'pg.log'),
        'start',
      ], { stdio: 'ignore' });

      let ready = false;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          execFileSync(bins.pgIsReady!, ['-h', workdir, '-p', port, '-U', 'postgres'], { stdio: 'ignore' });
          ready = true;
          break;
        } catch {
          // wait for postmaster
        }
      }
      expect(ready).toBe(true);

      const output = execFileSync(bins.psql!, [
        '-h', workdir,
        '-p', port,
        '-U', 'postgres',
        '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1',
        '-f', SQL,
      ], { encoding: 'utf8' });

      expect(output).toMatch(/DROP TABLE/);
      expect(output).toMatch(/UPDATE 1/);
      expect(output).toMatch(/DELETE 1/);
      expect(output).toMatch(/ROLLBACK/);
      expect(output.toLowerCase()).not.toMatch(/\berror\b/);
    } finally {
      try {
        execFileSync(bins.pgCtl!, ['-D', dataDir, 'stop', '-m', 'immediate'], { stdio: 'ignore' });
      } catch {
        // already stopped
      }
      rmSync(workdir, { recursive: true, force: true });
    }
  }, 60_000);
});

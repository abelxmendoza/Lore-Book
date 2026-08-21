import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  auditMigrationLedger,
  parseLocalMigrationFilename,
  PRODUCTION_LEDGER_CANON,
  readLocalMigrations,
} from './migrationLedgerAudit.mjs';

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

test('parses canonical migration filenames', () => {
  assert.deepEqual(parseLocalMigrationFilename('20260806010101_add_assertions.sql'), {
    version: '20260806010101',
    name: 'add_assertions',
    filename: '20260806010101_add_assertions.sql',
  });
});

test('classifies exact, retimestamped, malformed, and unmatched rows', () => {
  const local = [
    parseLocalMigrationFilename('20260806010101_add_assertions.sql'),
    parseLocalMigrationFilename('20260806020202_add_evidence.sql'),
    parseLocalMigrationFilename('20260806030303_local_pending.sql'),
  ].filter(Boolean);
  const remote = [
    { version: '20260806010101', name: 'add_assertions' },
    { version: '20260805999999', name: 'add_evidence' },
    { version: '20260806040404', name: 'remote_only' },
    { version: '20260806010101_add_assertions', name: 'add_assertions' },
  ];

  const result = auditMigrationLedger(local, remote);

  assert.equal(result.exact.length, 1);
  assert.equal(result.retimestamped.length, 1);
  assert.equal(result.malformedRemote.length, 1);
  assert.equal(result.malformedRemote[0].duplicatesCanonicalVersion, true);
  assert.equal(result.remoteOnly.length, 1);
  assert.deepEqual(result.localOnly.map((row) => row.name), ['local_pending']);
  assert.equal(result.safeForAutomaticPush, false);
});

test('allows local-only pending migrations when remote history is clean', () => {
  const local = [
    parseLocalMigrationFilename('20260806010101_applied.sql'),
    parseLocalMigrationFilename('20260806020202_pending.sql'),
  ].filter(Boolean);
  const result = auditMigrationLedger(local, [
    { version: '20260806010101', name: 'applied' },
  ]);

  assert.equal(result.localOnly.length, 1);
  assert.equal(result.safeForAutomaticPush, true);
});

test('matches by both version and name when local timestamps collide', () => {
  const local = [
    parseLocalMigrationFilename('20260806010101_first_change.sql'),
    parseLocalMigrationFilename('20260806010101_second_change.sql'),
  ].filter(Boolean);
  const result = auditMigrationLedger(local, [
    { version: '20260806010101', name: 'first_change' },
  ]);

  assert.equal(result.exact.length, 1);
  assert.equal(result.exact[0].local.name, 'first_change');
  assert.deepEqual(result.localOnly.map((row) => row.name), ['second_change']);
  assert.equal(result.ambiguousMappings.length, 0);
});

test('production Character Timeline DROP is an exact ledger match, not a retimestamp', () => {
  const drop = readLocalMigrations(migrationsDirectory).find(
    (row) => row.name === 'drop_character_timeline_events',
  );
  assert.ok(drop, 'drop_character_timeline_events.sql must exist in supabase/migrations');
  assert.equal(drop.version, PRODUCTION_LEDGER_CANON.drop_character_timeline_events);
  assert.equal(drop.filename, '20260821194550_drop_character_timeline_events.sql');

  const result = auditMigrationLedger([drop], [
    { version: '20260821194550', name: 'drop_character_timeline_events' },
  ]);
  assert.equal(result.exact.length, 1);
  assert.equal(result.retimestamped.length, 0);
  assert.equal(result.remoteOnly.length, 0);
  assert.equal(result.localOnly.length, 0);
  assert.equal(result.safeForAutomaticPush, true);

  const stale = auditMigrationLedger(
    [parseLocalMigrationFilename('20260821140000_drop_character_timeline_events.sql')],
    [{ version: '20260821194550', name: 'drop_character_timeline_events' }],
  );
  assert.equal(stale.retimestamped.length, 1);
  assert.equal(stale.safeForAutomaticPush, false);
});

test('fails closed when a nameless remote row maps to colliding local versions', () => {
  const local = [
    parseLocalMigrationFilename('20260806010101_first_change.sql'),
    parseLocalMigrationFilename('20260806010101_second_change.sql'),
  ].filter(Boolean);
  const result = auditMigrationLedger(local, [{ version: '20260806010101', name: '' }]);

  assert.equal(result.ambiguousMappings.length, 1);
  assert.equal(result.safeForAutomaticPush, false);
});

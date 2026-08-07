import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations_legacy_20260806/20260807020947_harden_internal_tables_rls.sql', import.meta.url),
  'utf8',
);

const tables = [
  'api_rate_limit_buckets',
  'project_chronicle_milestones',
  'project_chronicle_pending_detections',
  'project_chronicle_meta',
];

test('enables RLS and removes browser-role grants from internal tables', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`'${table}'`, 'i'));
  }
  assert.match(migration, /to_regclass\(format\('public\.%I', table_name\)\)/i);
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO service_role/i);
});

test('restricts and hardens the rate-limit RPC', () => {
  assert.match(migration, /to_regprocedure\('public\.check_api_rate_limit\(text,integer,integer\)'\)/i);
  assert.match(migration, /ALTER FUNCTION public\.check_api_rate_limit\(text, integer, integer\)\s+SET search_path = pg_catalog, public/i);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.check_api_rate_limit\(text, integer, integer\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.check_api_rate_limit\(text, integer, integer\)\s+TO service_role/i);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
});

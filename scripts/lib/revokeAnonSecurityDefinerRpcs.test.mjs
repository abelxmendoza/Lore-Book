import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20260819000000_revoke_anon_security_definer_rpcs.sql',
    import.meta.url,
  ),
  'utf8',
);

const procedures = [
  'public.get_pending_mrq(uuid)',
  'public.get_database_storage_stats()',
  'public.rls_auto_enable()',
  'public.get_or_create_usage(uuid,date)',
  'public.get_characters_for_event(uuid)',
  'public.semantic_search_across_engines(vector,integer)',
];

test('revokes Data API execute on SECURITY DEFINER RPCs', () => {
  for (const ident of procedures) {
    assert.match(migration, new RegExp(ident.replace(/[()[\]]/g, '\\$&')));
  }
  assert.match(migration, /to_regprocedure\(proc_ident\)/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO service_role/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION .+ TO anon/i);
});

test('pins search_path on get_pending_mrq and skips missing functions', () => {
  assert.match(
    migration,
    /ALTER FUNCTION public\.get_pending_mrq\(uuid\)\s+SET search_path = pg_catalog, public/i,
  );
  assert.match(migration, /missing; skip/i);
  assert.match(migration, /event_trigger/i);
});

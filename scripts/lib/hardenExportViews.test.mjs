import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20260819010000_harden_export_views_and_epiphany_insert.sql',
    import.meta.url,
  ),
  'utf8',
);

const views = [
  'omega_claims_with_evidence',
  'pipeline_runs_incomplete',
  'provenance_edges_export',
];

test('keeps export views as security_invoker and removes Data API grants', () => {
  for (const viewName of views) {
    assert.match(migration, new RegExp(`'${viewName}'`));
  }
  assert.match(migration, /ALTER VIEW public\.%I SET \(security_invoker = on\)/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(migration, /GRANT SELECT ON TABLE public\.%I TO service_role/i);
});

test('drops the open epiphany_insights insert policy', () => {
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Service role can insert epiphany insights"/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.epiphany_insights FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.epiphany_insights TO service_role/i,
  );
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*WITH CHECK \(true\)/i);
});

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);
const baseline = readFileSync(
  new URL('20260807040000_production_schema_baseline.sql', migrationsUrl),
  'utf8',
);
const evidencePolicy = readFileSync(
  new URL('20260807040300_optimize_assertion_evidence_rls.sql', migrationsUrl),
  'utf8',
);

test('active migration chain starts from the production schema baseline', () => {
  const files = readdirSync(migrationsUrl)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  assert.deepEqual(files, [
    '20260807040000_production_schema_baseline.sql',
    '20260807040100_narrative_moments_kind_expand.sql',
    '20260807040200_knowledge_kernel_foundation.sql',
    '20260807040300_optimize_assertion_evidence_rls.sql',
  ]);
});

test('baseline is replayable SQL without data or psql-only commands', () => {
  assert.match(baseline, /CREATE SCHEMA IF NOT EXISTS public/i);
  assert.match(baseline, /CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public/i);
  assert.match(baseline, /CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public/i);
  assert.doesNotMatch(baseline, /^\\(?:un)?restrict\b/m);
  assert.doesNotMatch(baseline, /^(?:INSERT INTO|COPY |UPDATE |DELETE FROM)\b/im);
  assert.doesNotMatch(baseline, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/i);
});

test('baseline retains production RLS and grants', () => {
  assert.match(baseline, /ALTER TABLE public\.characters ENABLE ROW LEVEL SECURITY/i);
  assert.match(baseline, /CREATE POLICY .* ON public\.characters/i);
  assert.match(baseline, /GRANT ALL ON TABLE public\.characters TO authenticated/i);
  assert.doesNotMatch(baseline, /GRANT .* ON TABLE public\.api_rate_limit_buckets TO anon/i);
  assert.doesNotMatch(baseline, /GRANT .* ON TABLE public\.api_rate_limit_buckets TO authenticated/i);
  assert.match(baseline, /GRANT ALL ON TABLE public\.api_rate_limit_buckets TO service_role/i);
});

test('evidence ownership policy uses the optimized auth lookup', () => {
  assert.match(evidencePolicy, /TO authenticated/i);
  assert.match(evidencePolicy, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/i);
  assert.match(evidencePolicy, /WITH CHECK \(\(SELECT auth\.uid\(\)\) = user_id\)/i);
});

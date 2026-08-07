import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260807040200_knowledge_kernel_foundation.sql', import.meta.url),
  'utf8',
);

test('bootstraps the shared evidence table before extending it', () => {
  const createIndex = migration.search(/CREATE TABLE IF NOT EXISTS public\.assertion_evidence/i);
  const alterIndex = migration.search(/ALTER TABLE public\.assertion_evidence\s+DROP CONSTRAINT/i);

  assert.ok(createIndex >= 0, 'expected assertion_evidence bootstrap');
  assert.ok(alterIndex > createIndex, 'expected evidence bootstrap before constraint extension');
  assert.match(migration, /ALTER TABLE public\.assertion_evidence ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_assertion_evidence_target/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.assertion_evidence FROM anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.assertion_evidence TO service_role/i,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS assertion_revision_links_from_fk_idx\s+ON public\.assertion_revision_links \(from_assertion_id\)/i,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS assertion_revision_links_to_fk_idx\s+ON public\.assertion_revision_links \(to_assertion_id\)/i,
  );
});

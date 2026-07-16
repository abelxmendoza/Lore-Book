import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260712130000_memory_proposal_integrity.sql'),
  'utf8'
);

describe('memory proposal integrity migration contract', () => {
  it('is tenant-scoped, partial, null-safe, and compatible with legacy rows', () => {
    expect(sql).toMatch(/ON public\.memory_proposals \(user_id,/);
    expect(sql).toMatch(/WHERE status = 'PENDING'/);
    expect(sql).toMatch(/policy_version' = 'v1'/);
    expect(sql).toMatch(/proposal_fingerprint' IS NOT NULL/);
  });

  it('fails clearly if policy-v1 duplicates exist before index creation', () => {
    expect(sql).toMatch(/GROUP BY user_id, metadata ->> 'proposal_fingerprint'/);
    expect(sql).toMatch(/HAVING count\(\*\) > 1/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('is idempotent, bounds lock waits, and documents rollback', () => {
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/g)).toHaveLength(2);
    expect(sql).toMatch(/SET lock_timeout = '5s'/);
    expect(sql).toMatch(/RESET lock_timeout/);
    expect(sql).toMatch(/Manual rollback/);
    expect(sql.match(/DROP INDEX IF EXISTS/g)).toHaveLength(2);
  });

  it('uses a normal transactional index build instead of unsupported concurrent DDL', () => {
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX CONCURRENTLY/i);
    expect(sql).toMatch(/apply this migration before deploying policy-v1 writers/i);
  });
});

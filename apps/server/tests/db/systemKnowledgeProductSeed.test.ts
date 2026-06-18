import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRODUCT_SELF_MODEL_CONCEPTS } from '../../src/services/chat/lorebookSelfModelService';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../supabase/migrations/20260618200000_system_knowledge_product_seed.sql'
);

const AGENT_MIGRATION_PATH = join(
  __dirname,
  '../../../../supabase/migrations/20260618100000_lore_agents.sql'
);

describe('system_knowledge product seed migration', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('migration file exists and is idempotent', () => {
    expect(sql).toContain('INSERT INTO system_knowledge');
    expect(sql).toContain('WHERE NOT EXISTS');
  });

  it('seeds every product self-model concept', () => {
    for (const concept of PRODUCT_SELF_MODEL_CONCEPTS) {
      expect(sql, `missing concept: ${concept}`).toContain(`'${concept}'`);
    }
  });

  it('includes user-facing descriptions (not only source_file paths)', () => {
    expect(sql).toContain('personal memory operating system');
    expect(sql).toContain('Memory Review');
    expect(sql).toContain('main character');
  });

  it('defines system_knowledge table in lore agents migration', () => {
    const agentSql = readFileSync(AGENT_MIGRATION_PATH, 'utf8');
    expect(agentSql).toContain('CREATE TABLE IF NOT EXISTS system_knowledge');
    expect(agentSql).toContain('authenticated_read');
  });
});

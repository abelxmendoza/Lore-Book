import { beforeEach, describe, expect, it, vi } from 'vitest';

const existing = vi.hoisted(() => ({ rows: [] as Array<{ project: string; highlight: string }> }));
const inserted = vi.hoisted(() => ({ checkpoints: [] as unknown[], milestones: [] as unknown[] }));

vi.mock('../../src/services/supabaseClient', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    let pending: unknown = null;
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: existing.rows, error: null });
    chain.upsert = (row: unknown) => { pending = row; inserted.checkpoints.push(row); return chain; };
    chain.insert = (row: unknown) => { pending = row; inserted.milestones.push(row); return chain; };
    chain.single = () => Promise.resolve({ data: { id: `${table}-id`, ...(pending as object) }, error: null });
    return chain;
  };
  return { supabaseAdmin: { from: (t: string) => builder(t) } };
});

import { HivemindSecretError, importAgentHivemindState, upsertMemory } from '../../src/services/hivemind/hivemindService';

describe('importAgentHivemindState', () => {
  beforeEach(() => {
    existing.rows = [];
    inserted.checkpoints = [];
    inserted.milestones = [];
  });

  it('upserts checkpoints and skips milestones that already exist', async () => {
    existing.rows = [{ project: 'Hivemind', highlight: 'Built the hub' }];
    const result = await importAgentHivemindState('u1', {
      active_tasks: [{ repo: 'Lore-Book', last_agent: 'Claude Code', where_i_left_off: 'Shipped', next_steps: ['Smoke'] }],
      career_ledger: {
        milestones: [
          { date: '2026-10', track: 'T', project: 'hivemind', highlight: 'built the hub' },
          { date: '2026-11', track: 'T', project: 'Lore-Book', highlight: 'Shipped Hivemind' },
          { date: '2026-11', track: 'T', project: 'Lore-Book', highlight: 'Shipped Hivemind' },
        ],
      },
    });
    expect(result).toEqual({ checkpoints: 1, milestonesAdded: 1, milestonesSkipped: 2, skippedForSecrets: 0 });
    expect(inserted.checkpoints[0]).toMatchObject({ user_id: 'u1', project: 'Lore-Book', agent: 'Claude Code' });
    expect(inserted.milestones[0]).toMatchObject({ user_id: 'u1', project: 'Lore-Book', occurred_at: '2026-11-01T00:00:00Z' });
  });

  it('skips imported entries that contain secrets', async () => {
    const result = await importAgentHivemindState('user-1', {
      active_tasks: [
        { repo: 'Safe', where_i_left_off: 'Wired the API' },
        { repo: 'Leaky', where_i_left_off: 'token ghp_abcdefghijklmnopqrstuvwxyz1234' },
      ],
      career_ledger: { milestones: [{ track: 'Eng', project: 'X', highlight: 'key AKIAABCDEFGHIJKLMNOP' }] },
    });
    expect(result).toMatchObject({ checkpoints: 1, milestonesAdded: 0, skippedForSecrets: 2 });
    expect(inserted.checkpoints).toHaveLength(1);
  });

  it('refuses to store a secret through the shared write path', async () => {
    await expect(
      upsertMemory('user-1', { title: 'deploy', content: 'use sk-abcdefghijklmnopqrstuv' }),
    ).rejects.toBeInstanceOf(HivemindSecretError);
    expect(inserted.checkpoints).toHaveLength(0);
  });
});

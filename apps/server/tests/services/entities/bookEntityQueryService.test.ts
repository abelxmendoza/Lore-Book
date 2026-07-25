import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown[]; error: unknown; count?: number };
const results: Record<string, Result> = {};
const chains: Array<{ table: string; chain: any }> = [];

function chainFor(table: string): any {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve(results[table] ?? { data: [], error: null, count: 0 })),
  };
  chains.push({ table, chain });
  return chain;
}

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => chainFor(table)),
  },
}));

import { queryBookEntities } from '../../../src/services/entities/bookEntityQueryService';

describe('queryBookEntities', () => {
  beforeEach(() => {
    for (const key of Object.keys(results)) delete results[key];
    chains.length = 0;
  });

  it('returns one normalized, paginated shape across book types', async () => {
    results.projects = {
      data: [{
        id: 'project-1',
        name: 'MemoVault',
        status: 'active',
        metadata: { aliases: ['LoreBook'] },
        updated_at: '2026-07-20T00:00:00Z',
      }],
      error: null,
      count: 1,
    };
    results.quests = {
      data: [{
        id: 'quest-1',
        title: 'Ship retrieval',
        status: 'active',
        metadata: {},
        updated_at: '2026-07-21T00:00:00Z',
      }],
      error: null,
      count: 1,
    };

    const result = await queryBookEntities('user-1', {
      types: ['project', 'quest'],
      limit: 10,
    });

    expect(result.counts).toEqual({ project: 1, quest: 1 });
    expect(result.total).toBe(2);
    expect(result.entities).toEqual([
      expect.objectContaining({ id: 'quest-1', name: 'Ship retrieval', type: 'quest' }),
      expect.objectContaining({
        id: 'project-1',
        name: 'MemoVault',
        type: 'project',
        aliases: ['LoreBook'],
      }),
    ]);
    expect(chains).toHaveLength(2);
    expect(chains.every(({ chain }) =>
      chain.select.mock.calls[0]?.[1]?.count === 'exact'
    )).toBe(true);
  });

  it('pushes pagination into the database for a single Book', async () => {
    results.organizations = {
      data: [{
        id: 'org-3',
        name: 'Vanguard Robotics',
        status: 'active',
        metadata: {},
        updated_at: '2026-07-22T00:00:00Z',
      }],
      error: null,
      count: 12,
    };

    const result = await queryBookEntities('user-1', {
      types: ['organization'],
      limit: 5,
      offset: 10,
    });

    expect(result.entities).toHaveLength(1);
    expect(result.total).toBe(12);
    expect(chains[0]?.chain.range).toHaveBeenCalledWith(10, 14);
  });
});

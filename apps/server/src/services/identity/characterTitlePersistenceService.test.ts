import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  row: {
    id: 'character-a',
    user_id: 'user-a',
    name: 'Taylor Example',
    alias: ['Tay'],
    metadata: {},
  } as Record<string, unknown>,
  updatePatch: null as Record<string, unknown> | null,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'characters') throw new Error(`Unexpected table ${table}`);
      const loadChain = {
        select: () => loadChain,
        eq: (column: string, value: unknown) => {
          state.filters.push([column, value]);
          return loadChain;
        },
        maybeSingle: async () => ({ data: state.row, error: null }),
      };
      return {
        select: () => loadChain,
        update: (patch: Record<string, unknown>) => {
          state.updatePatch = patch;
          const updateChain = {
            eq: (column: string, value: unknown) => {
              state.filters.push([column, value]);
              return updateChain;
            },
            select: () => updateChain,
            single: async () => ({
              data: { ...state.row, ...patch },
              error: null,
            }),
          };
          return updateChain;
        },
      };
    },
  },
}));

vi.mock('./identityLedgerService', () => ({
  identityLedgerService: { recordMutation: vi.fn().mockResolvedValue('mutation-a') },
}));

import { characterTitleService } from './characterTitlePersistenceService';

describe('characterTitleService.addAlias', () => {
  beforeEach(() => {
    state.row = {
      id: 'character-a',
      user_id: 'user-a',
      name: 'Taylor Example',
      alias: ['Tay'],
      metadata: {},
    };
    state.updatePatch = null;
    state.filters = [];
  });

  it('persists a normalized alias while enforcing user and character scope', async () => {
    const result = await characterTitleService.addAlias('user-a', 'character-a', {
      value: '  Static   Bloom  ',
      aliasType: 'stage_name',
    });

    expect(result?.aliases.map((alias) => alias.value)).toContain('Static Bloom');
    expect(state.updatePatch?.alias).toEqual(['Tay', 'Static Bloom']);
    expect(state.filters).toContainEqual(['id', 'character-a']);
    expect(state.filters).toContainEqual(['user_id', 'user-a']);
  });

  it('keeps column aliases when metadata display_title aliases are stale/partial', async () => {
    state.row = {
      id: 'character-a',
      user_id: 'user-a',
      name: 'Taylor Example',
      alias: ['Tay', 'Moon Signal'],
      metadata: {
        display_title: {
          characterId: 'character-a',
          primaryTitle: 'Taylor Example',
          titleParts: {},
          titleType: 'legal_or_full_name',
          aliases: [{ id: 'a1', value: 'Tay', aliasType: 'nickname', prominenceScore: 0, evidenceCount: 1 }],
          stability: 'stable',
          evidencePhrases: [],
        },
      },
    };

    const result = await characterTitleService.addAlias('user-a', 'character-a', {
      value: 'Static Bloom',
      aliasType: 'nickname',
    });

    expect(result?.aliases.map((alias) => alias.value).sort()).toEqual(
      ['Moon Signal', 'Static Bloom', 'Tay'].sort(),
    );
    expect(state.updatePatch?.alias).toEqual(expect.arrayContaining(['Tay', 'Moon Signal', 'Static Bloom']));
  });

  it('does not persist the primary title as a duplicate alias', async () => {
    state.row = {
      id: 'character-a',
      user_id: 'user-a',
      name: 'Taylor Example',
      alias: ['Taylor Example', 'Tay'],
      metadata: {},
    };

    const result = await characterTitleService.addAlias('user-a', 'character-a', {
      value: 'Static Bloom',
      aliasType: 'stage_name',
    });

    expect(result?.aliases.map((alias) => alias.value)).toEqual(['Tay', 'Static Bloom']);
    expect(state.updatePatch?.alias).toEqual(['Tay', 'Static Bloom']);
  });
});

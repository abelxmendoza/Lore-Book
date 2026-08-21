import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolvedByCharacter, makeChain } = vi.hoisted(() => {
  const resolvedByCharacter: Record<string, string[]> = {};
  function makeChain(table: string) {
    const filters: { characterId?: string } = {};
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: string) => {
      if (column === 'character_id') filters.characterId = value;
      return chain;
    };
    chain.or = () => chain;
    chain.contains = (_column: string, value: string[]) => {
      filters.characterId = value[0];
      return chain;
    };
    chain.then = (resolve: (value: unknown) => void) => {
      if (table === 'resolved_events') {
        const ids = resolvedByCharacter[filters.characterId ?? ''] ?? [];
        resolve({ data: ids.map((id) => ({ id })), error: null });
        return;
      }
      resolve({ data: [], error: null });
    };
    return chain;
  }
  return { resolvedByCharacter, makeChain };
});

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => makeChain(table),
  },
}));

import { canonicalEventIdsForCharacter } from './characters/resolvedEventPeopleRewrite';

describe('character dedup event overlap', () => {
  beforeEach(() => {
    for (const key of Object.keys(resolvedByCharacter)) delete resolvedByCharacter[key];
  });

  it('uses resolved_events.people[] instead of character_timeline_events', async () => {
    resolvedByCharacter['char-a'] = ['evt_shared', 'evt_a'];
    resolvedByCharacter['char-b'] = ['evt_shared', 'evt_b'];
    const [idsA, idsB] = await Promise.all([
      canonicalEventIdsForCharacter('user-1', 'char-a'),
      canonicalEventIdsForCharacter('user-1', 'char-b'),
    ]);
    const shared = [...idsA].filter((id) => idsB.has(id));
    expect(shared).toEqual(['evt_shared']);
  });
});

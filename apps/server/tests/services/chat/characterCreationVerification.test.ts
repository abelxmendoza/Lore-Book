import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown; count?: number | null };
function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: result.data, error: result.error }),
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

const hoisted = vi.hoisted(() => {
  let tableResults: Record<string, TableResult> = {};
  const fromMock = vi.fn((table: string) => makeChain(tableResults[table] ?? { data: null, error: null, count: 0 }));
  const resolveCharacterByName = vi.fn();
  return {
    fromMock,
    resolveCharacterByName,
    setTableResults: (next: Record<string, TableResult>) => {
      tableResults = next;
    },
  };
});

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => hoisted.fromMock(...args) },
}));

vi.mock('../../../src/services/chat/foundationRecallDataService', () => ({
  resolveCharacterByName: (...args: unknown[]) => hoisted.resolveCharacterByName(...args),
}));

import { verifyCharacterCreation } from '../../../src/services/chat/characterCreationVerification';

describe('characterCreationVerification — foundation registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveCharacterByName.mockResolvedValue(null);
    hoisted.setTableResults({
      characters: { data: [{ id: 'c1', name: 'Abuela', alias: [] }], error: null, count: 1 },
      locations: { data: [], error: null },
      organizations: { data: [], error: null },
      character_memories: { data: null, error: null, count: 2 },
      character_relationships: { data: null, error: null, count: 0 },
    });
  });

  it('does not query people_places', async () => {
    hoisted.resolveCharacterByName.mockResolvedValue({
      id: 'c1',
      name: 'Abuela',
      metadata: {},
    });

    await verifyCharacterCreation('user-1', 'Did you create Abuela?');

    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it('marks entity exists when character is in foundation index', async () => {
    hoisted.resolveCharacterByName.mockResolvedValue({
      id: 'c1',
      name: 'Abuela',
      metadata: {},
    });

    const { content } = await verifyCharacterCreation('user-1', 'Did you create Abuela?');

    expect(content).toContain('foundation registry');
    expect(content).toContain('Character exists');
    expect(content).not.toContain('people_places');
  });
});

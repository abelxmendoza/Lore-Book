import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown; count?: number | null };
function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    ilike: () => chain,
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

import { getMemoryFormationStatus } from '../../../src/services/chat/memoryFormationStatusService';

describe('memoryFormationStatusService — locations redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveCharacterByName.mockResolvedValue(null);
    hoisted.setTableResults({
      character_relationships: { data: null, error: null, count: 0 },
      character_memories: { data: null, error: null, count: 0 },
      character_timeline_events: { data: null, error: null, count: 0 },
      entity_facts: { data: null, error: null, count: 0 },
      resolved_events: { data: null, error: null, count: 0 },
      locations: { data: { id: 'l1', name: "Abuela's House" }, error: null },
    });
  });

  it('does not query people_places for location checks', async () => {
    await getMemoryFormationStatus('user-1', 'Did you save Abuela?');

    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
    expect(hoisted.fromMock).toHaveBeenCalledWith('locations');
  });

  it('reports location when matched in locations table', async () => {
    const { content } = await getMemoryFormationStatus('user-1', 'Did you save Abuela?');

    expect(content).toContain("Abuela's House");
    expect(content).toContain('**Location:**');
  });
});

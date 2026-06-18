import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown };
function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

const { fromMock, tableResultsRef } = vi.hoisted(() => {
  const tableResults: Record<string, TableResult> = {};
  const fromMock = vi.fn((table: string) => makeChain(tableResultsRef.current[table] ?? { data: [], error: null }));
  return { fromMock, tableResultsRef: { current: tableResults as Record<string, TableResult> } };
});

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { routeRecallQuery } from '../../src/services/chat/recallQueryRouter';
import { loadFoundationEntityIndex } from '../../src/services/chat/foundationEntityIndex';

describe('people_places read redirect — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResultsRef.current = {
      characters: { data: [{ id: 'c1', name: 'Sam Chen', alias: [] }], error: null },
      locations: { data: [{ id: 'l1', name: 'Blue Room', nicknames: [] }], error: null },
      organizations: { data: [], error: null },
      character_memories: { data: [{ character_id: 'c1' }], error: null },
      character_timeline_events: { data: [], error: null },
      character_relationships: { data: [], error: null },
      narrative_accounts: { data: { narrative_text: 'Narrative.', metadata: {} }, error: null },
      journal_entries: { data: [], error: null },
    };
  });

  it('loadFoundationEntityIndex skips people_places', async () => {
    await loadFoundationEntityIndex('user-1');
    expect(fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it('routeRecallQuery character roster skips people_places', async () => {
    await routeRecallQuery('user-1', 'Who are the characters in my story?');
    expect(fromMock).not.toHaveBeenCalledWith('people_places');
  });
});

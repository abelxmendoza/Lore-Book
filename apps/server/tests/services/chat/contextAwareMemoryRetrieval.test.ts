import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown };
function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

const hoisted = vi.hoisted(() => {
  let tableResults: Record<string, TableResult> = {};
  const fromMock = vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null }));
  return {
    fromMock,
    setTableResults: (next: Record<string, TableResult>) => {
      tableResults = next;
    },
  };
});

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => hoisted.fromMock(...args) },
}));

vi.mock('../../../src/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
}));

import { retrieveEntityMentionsAcrossThreads } from '../../../src/services/chat/contextAwareMemoryRetrieval';

describe('contextAwareMemoryRetrieval — cross-thread redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setTableResults({
      character_memories: {
        data: [{ journal_entry_id: 'entry-1' }, { journal_entry_id: 'entry-2' }],
        error: null,
      },
      journal_entries: {
        data: [
          { id: 'entry-1', user_id: 'user-1', content: 'Sam at the party', date: '2026-01-01', summary: null, tags: [], source: 'journal', metadata: {} },
        ],
        error: null,
      },
      chat_messages: { data: [], error: null },
    });
  });

  it('loads journal entries via character_memories not people_places', async () => {
    const results = await retrieveEntityMentionsAcrossThreads(
      'user-1',
      'Tell me about Sam Chen again',
      [{ id: 'c1', name: 'Sam Chen' }],
      5
    );
    expect(hoisted.fromMock).toHaveBeenCalledWith('character_memories');
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('entry-1');
  });

  it('returns empty when no characters mentioned in message', async () => {
    const results = await retrieveEntityMentionsAcrossThreads(
      'user-1',
      'What is the weather?',
      [{ id: 'c1', name: 'Sam Chen' }],
      5
    );
    expect(results).toEqual([]);
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it('returns empty on character_memories query error without throwing', async () => {
    hoisted.setTableResults({
      character_memories: { data: null, error: { message: 'db down' } },
      chat_messages: { data: [], error: null },
    });
    const results = await retrieveEntityMentionsAcrossThreads(
      'user-1',
      'Tell me about Sam Chen',
      [{ id: 'c1', name: 'Sam Chen' }],
      5
    );
    expect(results).toEqual([]);
  });
});

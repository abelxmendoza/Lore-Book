import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown };
function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
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
  logger: { warn: vi.fn() },
}));

import { verifyMemoryClaims } from '../../../src/services/chat/memoryClaimGuard';

describe('memoryClaimGuard — foundation name set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setTableResults({
      characters: { data: [{ id: 'c1', name: 'Sam Chen', alias: ['Sam'] }], error: null },
      locations: { data: [{ id: 'l1', name: 'Blue Room', nicknames: [] }], error: null },
      organizations: { data: [], error: null },
    });
  });

  it('does not query people_places', async () => {
    await verifyMemoryClaims('user-1', 'I remember you told me about Sam Chen.');
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it('flags unknown names when memory claim detected', async () => {
    const result = await verifyMemoryClaims('user-1', 'I remember you told me about Zephyr X.');
    expect(result.memoryClaimDetected).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.unknownNames.length).toBeGreaterThan(0);
  });

  it('does not flag known character names', async () => {
    const result = await verifyMemoryClaims('user-1', 'I remember what you said about Sam Chen.');
    expect(result.flagged).toBe(false);
  });

  it('passes through responses without memory claims', async () => {
    const result = await verifyMemoryClaims('user-1', 'The weather is nice today.');
    expect(result.memoryClaimDetected).toBe(false);
    expect(result.flagged).toBe(false);
  });
});

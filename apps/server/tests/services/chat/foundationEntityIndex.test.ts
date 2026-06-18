import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

import {
  buildLegacyPeoplePlacesView,
  loadFoundationEntityIndex,
  loadKnownNameSet,
} from '../../../src/services/chat/foundationEntityIndex';

describe('foundationEntityIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setTableResults({
      characters: { data: [{ id: 'c1', name: 'Sam Chen', alias: ['Sam'] }], error: null },
      locations: { data: [{ id: 'l1', name: 'Blue Room', nicknames: [] }], error: null },
      organizations: { data: [{ id: 'o1', name: 'Acme', aliases: [] }], error: null },
    });
  });

  it('indexes foundation tables without people_places queries', async () => {
    const map = await loadFoundationEntityIndex('user-1');
    expect(map.get('sam chen')?.id).toBe('c1');
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it('propagates database errors', async () => {
    hoisted.setTableResults({
      characters: { data: null, error: { message: 'fail' } },
      locations: { data: [], error: null },
      organizations: { data: [], error: null },
    });
    await expect(loadFoundationEntityIndex('user-1')).rejects.toEqual({ message: 'fail' });
  });

  it('loadKnownNameSet collects lowercase names from foundation tables', async () => {
    const names = await loadKnownNameSet('user-1');
    expect(names.has('sam chen')).toBe(true);
    expect(names.has('blue room')).toBe(true);
    expect(hoisted.fromMock).not.toHaveBeenCalledWith('people_places');
  });
});

describe('ragBuilderService source guard', () => {
  it('does not call peoplePlacesService or query people_places table', () => {
    const src = readFileSync(
      join(__dirname, '../../../src/services/chat/ragBuilderService.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/peoplePlacesService/);
    expect(src).not.toMatch(/from\('people_places'\)/);
    expect(src).toContain('buildLegacyPeoplePlacesView');
  });
});

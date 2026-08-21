import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown; count?: number };
let tableResults: Record<string, TableResult> = {};

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'contains', 'overlaps', 'in', 'order', 'limit']) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: TableResult) => void) => resolve(result);
  return chain;
}

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null, count: 0 })),
  },
}));

import { countCanonicalEventsForCharacter, countCanonicalEventsForCharacters } from './canonicalCharacterEventCount';

const USER = 'user-1';
const MAYA = 'char-maya';
const JAMIE = 'char-jamie';

describe('canonical character event counts', () => {
  beforeEach(() => {
    tableResults = {
      resolved_events: {
        data: [
          { id: 'evt-1', people: [MAYA] },
          { id: 'evt-2', people: [MAYA, JAMIE] },
        ],
        error: null,
        count: 2,
      },
    };
  });

  it('counts resolved_events.people[] membership, not character_timeline_events rows', async () => {
    expect(await countCanonicalEventsForCharacter(USER, MAYA)).toBe(2);
    const byId = await countCanonicalEventsForCharacters(USER, [MAYA, JAMIE]);
    expect(byId.get(MAYA)).toBe(2);
    expect(byId.get(JAMIE)).toBe(1);
  });
});

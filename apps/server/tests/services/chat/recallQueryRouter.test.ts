import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chainable Supabase mock ───────────────────────────────────────────────────
// Every query-builder method returns the same chain; awaiting/`.then`-ing the
// chain resolves to the configured result for that table. This mirrors the
// real client closely enough to validate routing decisions without a DB.

type TableResult = { data: any; error: any; count?: number };

function makeChain(result: TableResult) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    not: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, TableResult> = {};

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null })),
  },
}));

import { routeRecallQuery } from '../../../src/services/chat/recallQueryRouter';

const CHARACTERS = [
  { id: 'c1', name: 'Abuela', alias: [], metadata: { mention_count: 12 } },
  { id: 'c2', name: 'Sol', alias: [], metadata: { mention_count: 7 } },
  { id: 'c3', name: 'Anaheim', alias: [], metadata: { mention_count: 3 } },
];

describe('routeRecallQuery — character list intent (Sprint H fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      people_places: { data: [], error: null },
      characters: { data: CHARACTERS, error: null },
      narrative_accounts: { data: { narrative_text: 'Some narrative.', metadata: {} }, error: null },
    };
  });

  const queries = [
    'How many characters do you remember?',
    'Who do you remember?',
    'Who are the people in my story?',
    "Who's in my life?",
    'Tell me about the people you know',
    'List the people I have mentioned',
  ];

  it.each(queries)('routes "%s" to the character_list intent, not biography/general', async (message) => {
    const result = await routeRecallQuery('user-1', message);

    expect(result.intent).toBe('character_list');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns a context block built from the actual character roster', async () => {
    const result = await routeRecallQuery('user-1', 'How many characters do you remember?');

    expect(result.contextBlock).toContain('PEOPLE IN THIS STORY (3)');
    expect(result.contextBlock).toContain('Abuela');
    expect(result.contextBlock).toContain('Sol');
    expect(result.contextBlock).toContain('Anaheim');

    // Must not leak unrelated narrative/demo content into the answer surface —
    // this was the original bug ("Narrative mode / Warrior / Violence").
    expect(result.contextBlock).not.toContain('Narrative mode');
    expect(result.contextBlock).not.toContain('Warrior');
    expect(result.contextBlock).not.toContain('Violence');
  });

  it('reports plainly when no characters are recorded yet — no fabricated names', async () => {
    tableResults.characters = { data: [], error: null };

    const result = await routeRecallQuery('user-1', 'Who do you remember?');

    expect(result.intent).toBe('character_list');
    expect(result.contextBlock).toBe('No characters recorded yet.');
  });

  it('still routes a specific-person question to the entity intent, not character_list', async () => {
    tableResults.people_places = {
      data: [{ id: 'p1', name: 'Sol', type: 'person', corrected_names: [] }],
      error: null,
    };
    tableResults.character_relationships = { data: [], error: null };
    tableResults.character_timeline_events = { data: [], error: null };
    tableResults.journal_entries = { data: [], error: null };

    const result = await routeRecallQuery('user-1', 'Tell me about Sol');

    expect(result.intent).toBe('entity');
    expect(result.entityName).toBe('sol');
  });
});

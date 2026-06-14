import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: unknown; error: unknown; count?: number };

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
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
import { formatCharacterRosterForChat } from '../../../src/services/chat/foundationRecallDataService';

const CHARACTERS = [
  { id: 'c1', name: 'Abel', alias: [], metadata: {}, importance_level: 'protagonist' },
  { id: 'c2', name: 'Sol', alias: [], metadata: {} },
  { id: 'c3', name: 'Abuela', alias: [], metadata: {} },
];

const RELATIONSHIPS = [
  { relationship_type: 'grandmother', source_character_id: 'c3', target_character_id: 'c1', status: 'active', metadata: {} },
  { relationship_type: 'romantic_partner', source_character_id: 'c2', target_character_id: 'c1', status: 'blocked', metadata: {} },
];

describe('Sprint AF — foundation recall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      people_places: { data: [], error: null },
      characters: { data: CHARACTERS, error: null },
      character_memories: {
        data: [
          { character_id: 'c1' },
          { character_id: 'c2' },
          { character_id: 'c2' },
          { character_id: 'c3' },
        ],
        error: null,
      },
      character_timeline_events: {
        data: [
          { character_id: 'c2' },
          { character_id: 'c3' },
          { character_id: 'c3' },
        ],
        error: null,
      },
      character_relationships: { data: RELATIONSHIPS, error: null },
      narrative_accounts: { data: { narrative_text: 'Abel lives in Anaheim.', metadata: {} }, error: null },
      journal_entries: { data: [], error: null },
    };
  });

  it('returns character roster with memory and timeline counts — not journal snippets', async () => {
    const result = await routeRecallQuery('user-1', 'Who are the characters in my story?');

    expect(result.intent).toBe('character_roster');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Abel');
    expect(result.contextBlock).toContain('Sol');
    expect(result.contextBlock).toContain('Abuela');
    expect(result.contextBlock).toContain('memories');
    expect(result.contextBlock).toContain('timeline');
    expect(result.contextBlock).not.toContain('Relevant past entries');
  });

  it('routes family queries through character_relationships', async () => {
    const result = await routeRecallQuery('user-1', 'Tell me about my family');

    expect(result.intent).toBe('family');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Abuela');
    expect(result.contextBlock).toContain('grandmother');
  });

  it('routes entity queries to character foundation profile', async () => {
    const result = await routeRecallQuery('user-1', 'Tell me about Sol');

    expect(result.intent).toBe('entity');
    expect(result.entityName).toBe('Sol');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Sol');
    expect(result.contextBlock).toContain('memories');
  });

  it('formatCharacterRosterForChat lists name, relationship, counts', () => {
    const roster = [
      {
        id: 'c2',
        name: 'Sol',
        aliases: [],
        relationshipToUser: 'romantic_partner (blocked)',
        memoryCount: 2,
        timelineEventCount: 1,
        isSelf: false,
      },
    ];
    const text = formatCharacterRosterForChat(roster);
    expect(text).toContain('Sol');
    expect(text).toContain('romantic_partner');
    expect(text).toContain('2 memories');
    expect(text).toContain('1 timeline event');
  });

  it('routes "Who is Ashley De La Cruz?" to entity profile', async () => {
    tableResults = {
      ...tableResults,
      characters: {
        data: [
          ...CHARACTERS,
          { id: 'c4', name: 'Ashley De La Cruz', alias: ['Ashley'], metadata: {} },
        ],
        error: null,
      },
      entity_facts: {
        data: [
          { fact: 'Met after Club Metro in DTLA', confidence: 0.9 },
          { fact: 'Spent the night together', confidence: 0.85 },
          { fact: 'Age 19', confidence: 0.8 },
        ],
        error: null,
      },
      romantic_relationships: {
        data: { relationship_type: 'one_night_stand', status: 'ended', metadata: {} },
        error: null,
      },
    };

    const result = await routeRecallQuery('user-1', 'Who is Ashley De La Cruz?');
    expect(result.intent).toBe('entity');
    expect(result.entityName).toMatch(/Ashley/i);
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Ashley');
  });

  it('routes conversation recap without journal fallback flag', async () => {
    const history = [
      { role: 'user', content: 'Ashley De La Cruz was 19. We met after Club Metro in DTLA.' },
      { role: 'assistant', content: 'Got it — I will remember Ashley.' },
    ];
    const result = await routeRecallQuery(
      'user-1',
      'What else did I say in this conversation?',
      history
    );
    expect(result.intent).toBe('conversation');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).not.toContain('Relevant past entries');
  });
});

describe('routeRecallQuery — character list intent (Sprint H fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      people_places: { data: [], error: null },
      characters: {
        data: [
          { id: 'c1', name: 'Abuela', alias: [], metadata: { mention_count: 12 } },
          { id: 'c2', name: 'Sol', alias: [], metadata: { mention_count: 7 } },
          { id: 'c3', name: 'Anaheim', alias: [], metadata: { mention_count: 3 } },
        ],
        error: null,
      },
      character_memories: { data: [], error: null },
      character_timeline_events: { data: [], error: null },
      character_relationships: { data: [], error: null },
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

  it.each(queries)('routes "%s" to character_roster intent', async (message) => {
    const result = await routeRecallQuery('user-1', message);
    expect(result.intent).toBe('character_roster');
    expect(result.foundationPrimary).toBe(true);
  });

  it('routes "Recall all the characters in my story" to character_roster', async () => {
    const result = await routeRecallQuery('user-1', 'Recall all the characters in my story');
    expect(result.intent).toBe('character_roster');
    expect(result.contextBlock).toContain('Abuela');
    expect(result.contextBlock).toContain('Sol');
  });

  it('routes biography queries without journal fallback flag', async () => {
    const result = await routeRecallQuery('user-1', "Recall everything you've learned about me");
    expect(result.intent).toBe('biography');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Some narrative.');
  });
});

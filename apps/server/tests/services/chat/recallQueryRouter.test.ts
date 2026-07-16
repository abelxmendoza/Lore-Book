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
const fromMock = vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null }));

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { routeRecallQuery } from '../../../src/services/chat/recallQueryRouter';
import { formatCharacterRosterForChat } from '../../../src/services/chat/foundationRecallDataService';

const CHARACTERS = [
  { id: 'c1', name: 'Abel', alias: [], metadata: {}, importance_level: 'protagonist' },
  { id: 'c2', name: 'Sam Chen', alias: [], metadata: {} },
  { id: 'c3', name: 'Grandma Rose', alias: [], metadata: {} },
];

const RELATIONSHIPS = [
  { relationship_type: 'grandmother', source_character_id: 'c3', target_character_id: 'c1', status: 'active', metadata: {} },
  { relationship_type: 'romantic_partner', source_character_id: 'c2', target_character_id: 'c1', status: 'blocked', metadata: {} },
];

describe('Sprint AF — foundation recall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      characters: { data: CHARACTERS, error: null },
      locations: { data: [], error: null },
      organizations: { data: [], error: null },
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
    expect(result.contextBlock).toContain('Sam Chen');
    expect(result.contextBlock).toContain('Grandma Rose');
    expect(result.contextBlock).toContain('memories');
    expect(result.contextBlock).toMatch(/timeline|memory/i);
    expect(result.contextBlock).not.toContain('Relevant past entries');
  });

  it('routes family queries through character_relationships', async () => {
    const result = await routeRecallQuery('user-1', 'Tell me about my family');

    expect(result.intent).toBe('family');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Grandma Rose');
    expect(result.contextBlock).toContain('grandmother');
  });

  it('routes entity queries to character foundation profile', async () => {
    const result = await routeRecallQuery('user-1', 'Tell me about Sam Chen');

    expect(result.intent).toBe('entity');
    expect(result.entityName).toBe('Sam Chen');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Sam Chen');
    expect(result.contextBlock).toContain('memories');
  });

  it('formatCharacterRosterForChat lists name, relationship, counts', () => {
    const roster = [
      {
        id: 'c2',
        name: 'Sam Chen',
        aliases: [],
        relationshipToUser: 'romantic_partner (blocked)',
        memoryCount: 2,
        timelineEventCount: 1,
        isSelf: false,
      },
    ];
    const text = formatCharacterRosterForChat(roster);
    expect(text).toContain('Sam Chen');
    expect(text).toContain('romantic_partner');
    expect(text).toContain('appears in 2 memories');
    expect(text).toContain('1 timeline event');
  });

  it('routes "Who is Alex Morgan?" to entity profile', async () => {
    tableResults = {
      ...tableResults,
      characters: {
        data: [
          ...CHARACTERS,
          { id: 'c4', name: 'Alex Morgan', alias: ['Alex'], metadata: {} },
        ],
        error: null,
      },
      entity_facts: {
        data: [
          { fact: 'Met after Blue Room in DTLA', confidence: 0.9 },
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

    const result = await routeRecallQuery('user-1', 'Who is Alex Morgan?');
    expect(result.intent).toBe('entity');
    expect(result.entityName).toMatch(/Alex/i);
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Alex');
  });

  it('routes conversation recap without journal fallback flag', async () => {
    const history = [
      { role: 'user', content: 'Alex Morgan was 19. We met after Blue Room in DTLA.' },
      { role: 'assistant', content: 'Got it — I will remember Alex.' },
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

  it('does not query people_places for entity routing', async () => {
    await routeRecallQuery('user-1', 'Tell me about Sam Chen');
    expect(fromMock).not.toHaveBeenCalledWith('people_places');
  });
});

describe('routeRecallQuery — character list intent (Sprint H fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      locations: { data: [], error: null },
      organizations: { data: [], error: null },
      characters: {
        data: [
          { id: 'c1', name: 'Grandma Rose', alias: [], metadata: { mention_count: 12 } },
          { id: 'c2', name: 'Sam Chen', alias: [], metadata: { mention_count: 7 } },
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
    expect(result.contextBlock).toContain('Grandma Rose');
    expect(result.contextBlock).toContain('Sam Chen');
  });

  it('routes biography queries without journal fallback flag', async () => {
    const result = await routeRecallQuery('user-1', "Recall everything you've learned about me");
    expect(result.intent).toBe('biography');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Some narrative.');
  });

  it('builds identity recall from core identity through chronological life chapters before recent context', async () => {
    tableResults = {
      ...tableResults,
      narrative_accounts: {
        data: {
          narrative_text: 'Abel recently started working at Ring.',
          metadata: {
            facts: {
              identity: {
                name: 'Abel',
                hometown: 'Whittier',
                education: 'CSUF Computer Science graduate',
                career: 'Robotics and software engineering',
              },
            },
            themes: [{ theme: 'Career & work' }],
          },
        },
        error: null,
      },
      biographies: {
        data: {
          title: 'My Full Life Story',
          subtitle: 'A life shaped by building, fighting, and reinvention.',
          biography_data: {
            chapters: [
              {
                title: 'The Ring Era',
                text: 'Years later, I joined Ring and entered a new technical chapter.',
                timeSpan: { start: '2026-06-01', end: '2026-07-01' },
              },
              {
                title: 'Early Foundations',
                text: 'I grew up in Whittier before restaurant work and college reshaped my direction.',
                timeSpan: { start: '2000-01-01', end: '2018-01-01' },
              },
              {
                title: 'Robotics Takes Hold',
                text: 'Solar work and technical study led into robotics projects.',
                timeSpan: { start: '2019-01-01', end: '2025-12-31' },
              },
            ],
          },
        },
        error: null,
      },
      identity_core_profiles: {
        data: {
          summary: 'You repeatedly turn difficult technical work into creative self-reinvention.',
          stability: { anchors: ['roboticist', 'fighter', 'builder'] },
          dimensions: [
            {
              name: 'Builder',
              score: 0.91,
              signals: [{ text: 'Builds autobiographical systems' }, { text: 'Builds robots' }],
            },
            { name: 'Generic growth', score: 0.8, signals: [] },
          ],
        },
        error: null,
      },
      projects: {
        data: [
          {
            name: 'LoreBook',
            summary: 'an autobiographical memory system for AI',
            status: 'active',
            importance_score: 96,
          },
          { name: 'Weekend todo app', status: 'archived', importance_score: 20 },
        ],
        error: null,
      },
      interests: {
        data: [
          {
            interest_name: 'robotics',
            interest_level: 0.95,
            mention_count: 18,
            behavioral_impact_score: 0.9,
            time_investment_hours: 400,
          },
          {
            interest_name: 'one club night',
            interest_level: 0.8,
            mention_count: 1,
            behavioral_impact_score: 0.1,
            time_investment_hours: 3,
          },
        ],
        error: null,
      },
      skills: {
        data: [
          { skill_name: 'Muay Thai', total_xp: 900, is_active: true },
          { skill_name: 'Brazilian Jiu-Jitsu', total_xp: 700, is_active: true },
          { skill_name: 'C++', total_xp: 600, is_active: true },
        ],
        error: null,
      },
      organizations: {
        data: [
          { name: 'CSUF', type: 'university', importance_score: 95 },
          { name: 'Serve Robotics', type: 'company', importance_score: 92 },
          { name: 'Armstrong Robotics', type: 'company', importance_score: 88 },
          { name: 'Ring', type: 'company', importance_score: 80 },
        ],
        error: null,
      },
      characters: {
        data: [
          { id: 'self', name: 'Abel', importance_level: 'protagonist', importance_score: 100, metadata: { is_self: true } },
          { id: 'sol', name: 'Sol', importance_level: 'major', importance_score: 91, relationship_depth: 0.8, metadata: {} },
          { id: 'james', name: 'Cousin James', importance_level: 'minor', importance_score: 25, relationship_depth: 0.1, metadata: {} },
        ],
        error: null,
      },
      character_relationships: {
        data: [
          { source_character_id: 'self', target_character_id: 'sol', relationship_type: 'close_friend' },
          { source_character_id: 'self', target_character_id: 'james', relationship_type: 'cousin' },
        ],
        error: null,
      },
      character_memories: {
        data: [
          { character_id: 'sol' },
          { character_id: 'sol' },
          { character_id: 'sol' },
          { character_id: 'james' },
        ],
        error: null,
      },
    };

    const result = await routeRecallQuery('user-1', 'Who am I?');

    expect(result.contextBlock).toContain('## CORE IDENTITY');
    expect(result.contextBlock).toContain('Hometown: Whittier');
    expect(result.contextBlock).toContain('## LIFE STORY — CHRONOLOGICAL');
    expect(result.contextBlock.indexOf('Early Foundations')).toBeLessThan(
      result.contextBlock.indexOf('Robotics Takes Hold'),
    );
    expect(result.contextBlock.indexOf('Robotics Takes Hold')).toBeLessThan(
      result.contextBlock.indexOf('The Ring Era'),
    );
    expect(result.contextBlock.indexOf('The Ring Era')).toBeLessThan(
      result.contextBlock.indexOf('## CURRENT CHAPTER'),
    );
    expect(result.contextBlock).toContain('## IDENTITY SYNTHESIS');
    expect(result.contextBlock).toContain('LoreBook (an autobiographical memory system for AI)');
    expect(result.contextBlock).toContain('Serve Robotics');
    expect(result.contextBlock).toContain('Muay Thai');
    expect(result.contextBlock).toContain('Brazilian Jiu-Jitsu');
    expect(result.contextBlock).toContain('robotics');
    expect(result.contextBlock).toContain('Sol — close friend; importance 91/100; 3 supporting memories');
    expect(result.contextBlock).not.toContain('Cousin James');
    expect(result.contextBlock).not.toContain('one club night');
    expect(result.contextBlock).not.toContain('Generic growth');
    expect(result.contextBlock).not.toContain('People in your story');
  });
});

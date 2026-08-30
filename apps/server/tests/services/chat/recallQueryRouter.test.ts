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

vi.mock('../../../src/services/chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimeline: vi.fn(async () => ({ items: [], unresolved_items: [] })),
  },
}));

const { getIdentitySnapshotMock, composeIdentityRecallMock, getNarrativeIdentityRecallMock } = vi.hoisted(() => ({
  getIdentitySnapshotMock: vi.fn(),
  composeIdentityRecallMock: vi.fn(),
  getNarrativeIdentityRecallMock: vi.fn(),
}));

vi.mock('../../../src/services/identitySnapshot', () => ({
  getIdentitySnapshot: getIdentitySnapshotMock,
  composeIdentityRecall: composeIdentityRecallMock,
}));

vi.mock('../../../src/services/livingBiographyService', () => ({
  getNarrativeIdentityRecall: getNarrativeIdentityRecallMock,
}));

const getResumeDocumentsMock = vi.fn();
vi.mock('../../../src/services/profileClaims/resumeParsingService', () => ({
  resumeParsingService: {
    getResumeDocuments: getResumeDocumentsMock,
  },
}));

import { routeRecallQuery } from '../../../src/services/chat/recallQueryRouter';
import { formatCharacterRosterForChat } from '../../../src/services/chat/foundationRecallDataService';
import { stitchedTimelineService } from '../../../src/services/chronologyV2/stitchedTimelineService';

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
    getIdentitySnapshotMock.mockResolvedValue({
      id: 'identity-test',
      algorithmVersion: 'identity-snapshot-v1',
      stale: false,
      confidence: 0.84,
      coverage: [{ domain: 'career', score: 88, band: 'strong' }],
      provenance: { evidenceCount: 12 },
    });
    composeIdentityRecallMock.mockReturnValue([
        '## Core identity',
        'Marcus — a robotics engineer and product builder.',
        '',
        '## Current chapter',
        'Career Rebuilding and Building Chapter.',
      ].join('\n'));
    getNarrativeIdentityRecallMock.mockResolvedValue({
      content: '## Who you are\nA concise grounded fallback.',
      card: { hasEnoughData: true },
      provenance: { sourceEntryCount: 3 },
    });
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
      resolved_events: {
        data: [
          { people: ['c2'] },
          { people: ['c3'] },
          { people: ['c3'] },
        ],
        error: null,
      },
      character_relationships: { data: RELATIONSHIPS, error: null },
      narrative_accounts: { data: { narrative_text: 'Abel lives in Anaheim.', metadata: {} }, error: null },
      journal_entries: { data: [], error: null },
    };
    getResumeDocumentsMock.mockResolvedValue([]);
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

  it('returns the complete deduplicated employment history with work-specific sources', async () => {
    getResumeDocumentsMock.mockResolvedValue([
      {
        id: 'resume-new',
        file_name: 'current-resume.pdf',
        uploaded_at: '2026-08-28T00:00:00.000Z',
        processing_status: 'completed',
        parsed_data: {
          structured: {
            employment: [
              { company: 'Vanguard Robotics', title: 'Test Engineer', startDate: '2025-01', endDate: null, isCurrent: true },
              { company: 'Northwind Labs', title: 'Technician', startDate: '2023-04', endDate: '2024-12' },
            ],
          },
        },
      },
      {
        id: 'resume-old',
        file_name: 'older-resume.pdf',
        uploaded_at: '2025-01-01T00:00:00.000Z',
        processing_status: 'completed',
        parsed_data: {
          structured: {
            employment: [
              { company: 'Northwind Labs', title: 'Technician', startDate: '2023-04', endDate: '2024-12' },
              { company: 'Northwind Depot', title: 'Assembler', startDate: '2021', endDate: '2023-03' },
            ],
          },
        },
      },
    ]);

    const result = await routeRecallQuery('user-1', 'what jobs have i had');

    expect(result.intent).toBe('work');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Vanguard Robotics');
    expect(result.contextBlock).toContain('Jan 2025 – Present');
    expect(result.contextBlock).toContain('Northwind Labs');
    expect(result.contextBlock).toContain('Northwind Depot');
    expect(result.contextBlock.match(/Northwind Labs/g)).toHaveLength(1);
    expect(result.metadata).toMatchObject({ work_history_count: 3 });
    expect(result.metadata?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Test Engineer at Vanguard Robotics', type: 'knowledge' }),
        expect.objectContaining({ title: 'Assembler at Northwind Depot', type: 'knowledge' }),
      ]),
    );
    expect(result.metadata?.sources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Northwind Labs' })]),
    );
  });

  it('returns the complete deduplicated education history with school-specific sources', async () => {
    getResumeDocumentsMock.mockResolvedValue([
      {
        id: 'resume-new',
        file_name: 'current-resume.pdf',
        uploaded_at: '2026-08-28T00:00:00.000Z',
        processing_status: 'completed',
        parsed_data: {
          structured: {
            education: [
              { institution: 'Northwind University', degree: 'Bachelor of Science', field: 'Computer Engineering', startDate: '2018', endDate: '2022' },
              { institution: 'Northwind Community College', degree: 'Associate Degree', field: 'Electronics', startDate: '2016', endDate: '2018' },
            ],
          },
        },
      },
      {
        id: 'resume-old',
        file_name: 'older-resume.pdf',
        uploaded_at: '2025-01-01T00:00:00.000Z',
        processing_status: 'completed',
        parsed_data: {
          structured: {
            education: [
              { institution: 'Northwind University', degree: 'Bachelor of Science', field: 'Computer Engineering', startDate: '2018', endDate: '2022' },
            ],
          },
        },
      },
    ]);
    tableResults.profile_claims = {
      data: [
        {
          id: 'claim-education-chat',
          claim_text: 'Studied embedded systems at Northwind Technical Institute',
          source: 'chat',
          confidence: 0.9,
          verified_status: 'unverified',
          user_confirmed: false,
          last_updated_at: '2026-08-27T00:00:00.000Z',
        },
      ],
      error: null,
    };

    const result = await routeRecallQuery('user-1', 'what schools have I been to?');

    expect(result.intent).toBe('education');
    expect(result.foundationPrimary).toBe(true);
    expect(result.contextBlock).toContain('Northwind University');
    expect(result.contextBlock).toContain('Northwind Community College');
    expect(result.contextBlock).toContain('Northwind Technical Institute');
    expect(result.contextBlock.match(/Northwind University/g)).toHaveLength(1);
    expect(result.metadata).toMatchObject({ education_history_count: 3 });
    expect(result.metadata?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Northwind University', type: 'knowledge' }),
        expect.objectContaining({ title: 'Northwind Community College', type: 'knowledge' }),
        expect.objectContaining({ title: 'Studied embedded systems at Northwind Technical Institute', type: 'knowledge' }),
      ]),
    );
  });

  it('returns both domains for a combined work-and-education query', async () => {
    getResumeDocumentsMock.mockResolvedValue([
      {
        id: 'resume-combined',
        file_name: 'career-record.pdf',
        uploaded_at: '2026-08-28T00:00:00.000Z',
        processing_status: 'completed',
        parsed_data: {
          structured: {
            employment: [
              { company: 'Vanguard Robotics', title: 'Test Engineer', startDate: '2025', endDate: null, isCurrent: true },
            ],
            education: [
              { institution: 'Northwind University', degree: 'Bachelor of Science', field: 'Computer Engineering', startDate: '2018', endDate: '2022' },
            ],
          },
        },
      },
    ]);
    tableResults.profile_claims = { data: [], error: null };

    const result = await routeRecallQuery('user-1', 'what jobs have i had and schools ive been to?');

    expect(result.intent).toBe('work_and_education');
    expect(result.contextBlock).toContain('## Work history');
    expect(result.contextBlock).toContain('Vanguard Robotics');
    expect(result.contextBlock).toContain('## Education');
    expect(result.contextBlock).toContain('Northwind University');
    expect(result.metadata?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Test Engineer at Vanguard Robotics' }),
        expect.objectContaining({ title: 'Northwind University' }),
      ]),
    );
  });
});

describe('routeRecallQuery — character list intent (Sprint H fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIdentitySnapshotMock.mockResolvedValue({
      id: 'identity-test',
      algorithmVersion: 'identity-snapshot-v1',
      stale: false,
      confidence: 0.84,
      coverage: [{ domain: 'career', score: 88, band: 'strong' }],
      provenance: { evidenceCount: 12 },
    });
    composeIdentityRecallMock.mockReturnValue('## Core identity\nMarcus — a robotics engineer and product builder.');
    getNarrativeIdentityRecallMock.mockResolvedValue({
      content: '## Who you are\nA concise grounded fallback.',
      card: { hasEnoughData: true },
      provenance: { sourceEntryCount: 3 },
    });
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
      resolved_events: { data: [], error: null },
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
    expect(result.contextBlock).toContain('Core identity');
    expect(result.metadata).toMatchObject({
      narrative_recall_version: 3,
      identity_snapshot_id: 'identity-test',
      identity_snapshot_version: 'identity-snapshot-v1',
    });
  });

  it('returns the concise shared identity projection instead of the full stored biography', async () => {
    const result = await routeRecallQuery('user-1', 'Who am I?');

    expect(result.contextBlock).toContain('## Core identity');
    expect(result.contextBlock).toContain('robotics engineer');
    expect(result.contextBlock).not.toContain('LIFE STORY — CHRONOLOGICAL');
    expect(result.contextBlock).not.toMatch(/active|pending|dismissed|superseded/i);
    expect(getIdentitySnapshotMock).toHaveBeenCalledWith('user-1');
    expect(composeIdentityRecallMock).toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses temporal.occurred.start for timeline recall and labels unresolved dates', async () => {
    vi.mocked(stitchedTimelineService.getStitchedTimeline).mockResolvedValueOnce({
      items: [
        {
          title: 'Known occurrence',
          body: 'Canonical start',
          occurrenceStatus: 'confirmed',
          occurredAt: null,
          sortTime: '1970-01-01T00:00:00.000Z',
          temporal: {
            occurred: { start: '2024-06-15T00:00:00.000Z', status: 'anchored' },
            recordedAt: '2026-08-21T12:00:00.000Z',
          },
        },
        {
          title: 'Unresolved occurrence',
          body: 'Recording is not occurrence',
          occurrenceStatus: 'unresolved',
          occurredAt: '2026-08-21T00:00:00.000Z',
          sortTime: '2026-08-21T00:00:00.000Z',
          temporal: {
            occurred: { start: null, status: 'unanchored' },
            recordedAt: '2026-08-21T12:00:00.000Z',
          },
        },
      ],
    } as never);

    const result = await routeRecallQuery('user-1', 'What happened recently?');
    expect(result.intent).toBe('temporal');
    expect(result.contextBlock).toContain('2024-06-15T00:00:00.000Z: Known occurrence');
    expect(result.contextBlock).toContain('date unresolved: Unresolved occurrence');
    expect(result.contextBlock).not.toContain('1970-01-01');
    expect(result.contextBlock).not.toContain('2026-08-21T00:00:00.000Z: Unresolved');
  });

  it('degrades to the concise Living Biography projection instead of breaking chat', async () => {
    getIdentitySnapshotMock.mockRejectedValueOnce(new Error('projection unavailable'));

    const result = await routeRecallQuery('user-1', 'What do you remember about me?');

    expect(result.contextBlock).toContain('concise grounded fallback');
    expect(result.metadata).toMatchObject({
      narrative_recall_version: 2,
      identity_snapshot_degraded: true,
    });
  });
});

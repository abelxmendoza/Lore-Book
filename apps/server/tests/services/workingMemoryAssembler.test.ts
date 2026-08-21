import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: any; error: unknown; count?: number };

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    update: () => chain,
    ilike: () => chain,
    or: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    contains: () => chain,
    overlaps: () => chain,
    order: () => chain,
    limit: () => chain,
    upsert: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve(result),
    maybeSingle: () =>
      Promise.resolve({
        ...result,
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
      }),
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, TableResult> = {};

const fromMock = vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null }));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const getUserTimezoneMock = vi.fn().mockResolvedValue('UTC');
vi.mock('../../src/services/temporal/userTimezoneService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/temporal/userTimezoneService')>();
  return {
    ...actual,
    getUserTimezone: (...args: unknown[]) => getUserTimezoneMock(...args),
  };
});

import { assembleWorkingMemory, buildWorkingMemoryPacket } from '../../src/services/chat/workingMemoryAssembler';
import { invalidateTurnWorkingMemory } from '../../src/services/chat/turnWorkingMemoryCache';
import { stitchedTimelineService } from '../../src/services/chronologyV2/stitchedTimelineService';

describe('Working Memory Assembler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateTurnWorkingMemory();
    tableResults = {
      characters: {
        data: [
          {
            id: 'char-ashley',
            name: 'Alex Morgan',
            alias: ['Alex'],
            summary: 'Met after Blue Room.',
            importance_score: 72,
            metadata: {
              al_biography: { narrative_summary: 'Alex was a short but memorable Blue Room chapter.' },
            },
            updated_at: '2026-06-10T00:00:00Z',
          },
          {
            id: 'char-sol',
            name: 'Sam Chen',
            alias: [],
            summary: 'A relationship thread with unresolved emotion.',
            importance_score: 80,
            metadata: {},
            updated_at: '2026-06-11T00:00:00Z',
          },
          {
            id: 'char-abuela',
            name: 'Grandma Rose',
            alias: [],
            summary: 'Family anchor.',
            importance_score: 90,
            metadata: {},
            updated_at: '2026-06-09T00:00:00Z',
          },
          {
            id: 'char-tio-juan',
            name: 'Tio Juan',
            alias: ['Uncle James'],
            summary: 'Family member connected to family stories.',
            importance_score: 70,
            metadata: {},
            updated_at: '2026-06-08T00:00:00Z',
          },
          {
            id: 'char-leslie',
            name: 'Morgan Gray',
            alias: [],
            summary: 'Connected to graduation memories.',
            importance_score: 68,
            metadata: {},
            updated_at: '2026-06-07T00:00:00Z',
          },
        ],
        error: null,
      },
      locations: {
        data: [{ id: 'loc-metro', name: 'Blue Room', importance_score: 65 }],
        error: null,
      },
      organizations: {
        data: [{ id: 'org-amazon', name: 'Amazon', importance_score: 40 }],
        error: null,
      },
      projects: {
        data: [
          {
            id: 'proj-lifeledger',
            name: 'LifeLedger',
            description: 'Personal memory system progressing through retrieval architecture.',
            status: 'active',
            updated_at: '2026-06-12T00:00:00Z',
          },
        ],
        error: null,
      },
      character_memories: {
        data: [
          {
            id: 'mem-ashley',
            summary: 'Alex and I met after Blue Room in DTLA.',
            journal_entry_id: 'entry-ashley',
            created_at: '2026-06-10T00:00:00Z',
          },
          {
            id: 'mem-sol',
            summary: 'Sam Chen came up as an emotionally complicated relationship memory.',
            journal_entry_id: 'entry-sol',
            created_at: '2026-06-11T00:00:00Z',
          },
          {
            id: 'mem-family',
            summary: 'Grandma Rose and Tio Juan appeared in a family memory.',
            journal_entry_id: 'entry-family',
            created_at: '2026-06-09T00:00:00Z',
          },
          {
            id: 'mem-leslie',
            summary: "Morgan Gray's graduation was a remembered event.",
            journal_entry_id: 'entry-leslie',
            created_at: '2026-06-07T00:00:00Z',
          },
        ],
        error: null,
      },
      character_timeline_events: {
        data: [
          {
            id: 'ev-ashley',
            event_title: 'Alex after Blue Room',
            event_type: 'romantic_scene',
            event_date: '2026-06-10',
            event_summary: 'Met Alex after Blue Room and spent time together.',
            significance_score: 72,
            confidence: 0.86,
          },
          {
            id: 'ev-lifeledger',
            event_title: 'LifeLedger retrieval sprint',
            event_type: 'project_progress',
            event_date: '2026-06-12',
            event_summary: 'Working Memory Assembler design started.',
            significance_score: 80,
            confidence: 0.9,
          },
          {
            id: 'ev-leslie',
            event_title: "Morgan Gray's graduation",
            event_type: 'graduation',
            event_date: '2026-06-07',
            event_summary: "Morgan Gray's graduation was a family/social milestone.",
            significance_score: 78,
            confidence: 0.86,
          },
        ],
        error: null,
      },
      entity_timeline_events: { data: [], error: null },
      character_relationships: {
        data: [
          {
            id: 'rel-sol',
            relationship_type: 'romantic_tension',
            status: 'unresolved',
            source_character_id: 'char-sol',
            target_character_id: 'self',
            strength: 80,
            updated_at: '2026-06-11T00:00:00Z',
          },
          {
            id: 'rel-abuela',
            relationship_type: 'grandmother',
            status: 'active',
            source_character_id: 'char-abuela',
            target_character_id: 'self',
            strength: 95,
            updated_at: '2026-06-09T00:00:00Z',
          },
        ],
        error: null,
      },
      entity_facts: {
        data: [
          { id: 'fact-ashley', fact: 'Alex was connected to Blue Room.', confidence: 0.88, updated_at: '2026-06-10T00:00:00Z' },
          { id: 'fact-sol', fact: 'Sam Chen is relationship-relevant, not project context.', confidence: 0.8, updated_at: '2026-06-11T00:00:00Z' },
        ],
        error: null,
      },
      journal_entries: {
        data: [
          {
            id: 'entry-metro',
            summary: 'Blue Room night',
            content: 'At Blue Room I met Alex and the night became a memorable scene.',
            date: '2026-06-10T00:00:00Z',
            tags: ['significant'],
            source: 'manual',
            metadata: {},
          },
          {
            id: 'entry-lifeledger',
            summary: 'LifeLedger progress',
            content: 'LifeLedger is progressing through context assembly and retrieval design.',
            date: '2026-06-12T00:00:00Z',
            tags: ['project'],
            source: 'manual',
            metadata: {},
          },
          {
            id: 'entry-costco',
            summary: 'Costco errand',
            content: 'Costco came up as an errand, not a person.',
            date: '2026-06-08T00:00:00Z',
            tags: ['errand'],
            source: 'manual',
            metadata: {},
          },
        ],
        error: null,
      },
      chat_messages: {
        data: [
          {
            id: 'chat-1',
            content: 'Did you save Alex after Blue Room?',
            created_at: '2026-06-10T00:00:00Z',
            session_id: 'thread-1',
            role: 'user',
          },
        ],
        error: null,
      },
      entity_relationships: {
        data: [
          {
            id: 'er-work',
            from_entity_id: 'char-ashley',
            to_entity_id: 'org-amazon',
            from_entity_type: 'character',
            to_entity_type: 'omega_entity',
            relationship_type: 'WORKS_FOR',
            scope: 'PROFESSIONAL',
            confidence: 0.9,
            metadata: { role: 'coworker' },
            updated_at: '2026-06-12T00:00:00Z',
          },
        ],
        error: null,
      },
      narrative_accounts: {
        data: [
          {
            id: 'bio-1',
            account_type: 'biography_snapshot',
            narrative_text: 'You are building LifeLedger while tracking relationships and family memory.',
            metadata: {},
            recorded_at: '2026-06-12T00:00:00Z',
          },
        ],
        error: null,
      },
      // Real conversation episodes (public.episodes) — provenance-first scene log.
      episodes: {
        data: [
          {
            id: 'ep-blue-room',
            title: 'Blue Room · Alex',
            start_at: '2026-06-10T01:00:00Z',
            end_at: '2026-06-10T03:00:00Z',
            boundary_reason: 'time-gap(6h)',
            source_message_ids: ['msg-br-1', 'msg-br-2'],
            source_entity_ids: ['char-ashley'],
            participant_ids: ['char-ashley'],
            location_ids: ['loc-metro'],
            source_thread_id: 'thread-blue-room',
            source_event_ids: [],
          },
          {
            id: 'ep-sol',
            title: 'Sam Chen · unresolved',
            start_at: '2026-06-11T18:00:00Z',
            end_at: '2026-06-11T19:30:00Z',
            boundary_reason: 'topic-shift',
            source_message_ids: ['msg-sol-1'],
            source_entity_ids: ['char-sol'],
            participant_ids: ['char-sol'],
            location_ids: [],
            source_thread_id: 'thread-sol',
            source_event_ids: [],
          },
          {
            id: 'ep-grad',
            title: "Morgan Gray's graduation",
            start_at: '2026-06-07T16:00:00Z',
            end_at: '2026-06-07T20:00:00Z',
            boundary_reason: 'time-gap(12h)',
            source_message_ids: ['msg-grad-1', 'msg-grad-2', 'msg-grad-3'],
            source_entity_ids: ['char-leslie'],
            participant_ids: ['char-leslie'],
            location_ids: [],
            source_thread_id: 'thread-grad',
            source_event_ids: [],
          },
        ],
        error: null,
      },
      resolved_events: { data: [], error: null },
    };

    // Episode snippet loader reuses chat_messages; merge source message bodies dynamically
    // so tests that override chat_messages (relationship metadata) still work.
    const episodeSnippets: Array<{ id: string; content: string; role: string }> = [
      {
        id: 'msg-br-1',
        content: 'I met Alex after Blue Room in DTLA and we walked around.',
        role: 'user',
      },
      {
        id: 'msg-br-2',
        content: 'That night with Alex felt like a short but memorable chapter.',
        role: 'user',
      },
      {
        id: 'msg-sol-1',
        content: 'Sam Chen still comes up when I think about unfinished feelings.',
        role: 'user',
      },
      {
        id: 'msg-grad-1',
        content: "Morgan Gray's graduation was packed and emotional.",
        role: 'user',
      },
      {
        id: 'msg-grad-2',
        content: 'We took photos after the ceremony.',
        role: 'user',
      },
      {
        id: 'msg-grad-3',
        content: 'Family dinner after graduation ran late.',
        role: 'user',
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === 'chat_messages') {
        const baseRows = Array.isArray(tableResults.chat_messages?.data)
          ? tableResults.chat_messages.data
          : [];
        const merged = [
          ...baseRows,
          ...episodeSnippets.filter(
            (snippet) => !baseRows.some((row: { id?: string }) => row.id === snippet.id)
          ),
        ];
        return makeChain({ data: merged, error: null });
      }
      return makeChain(tableResults[table] ?? { data: [], error: null });
    });
  });

  it('assembles a person working memory for Alex without pulling unrelated context when budgeted', async () => {
    const result = await assembleWorkingMemory(
      { userId: 'user-1', question: 'What do you know about Alex?' },
      { maxItems: 6 }
    );

    expect(result.intent).toBe('PERSON_QUERY');
    expect(result.entities.some((entity) => entity.name.includes('Alex'))).toBe(true);
    expect(result.episodes.some((item) => /Alex|Blue Room/i.test(item.content))).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.budget.selected).toBeLessThanOrEqual(6);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.timing?.queryCount).toBeGreaterThan(0);
    expect(result.timing?.totalMs).toBeGreaterThanOrEqual(0);

    const packet = buildWorkingMemoryPacket(result);
    expect(packet.text).toContain('WORKING MEMORY PACKET');
    expect(packet.text).toContain('source=');
    expect(packet.text).toContain('confidence=');
    expect(packet.text).toContain('score=');
    expect(packet.text).toContain('reason=');
  });

  it('loads public.episodes with source_message_ids provenance for person recall', async () => {
    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What do you know about Alex?',
    });

    const scene = result.episodes.find((item) => item.source === 'episodes');
    expect(scene).toBeDefined();
    expect(scene!.sourceMessageIds?.length).toBeGreaterThan(0);
    expect(scene!.sourceThreadId).toBe('thread-blue-room');
    expect(scene!.id).toMatch(/^scene_episode:/);
    expect(scene!.content).toMatch(/You said|Blue Room|Alex/i);
    expect(fromMock).toHaveBeenCalledWith('episodes');

    const packet = buildWorkingMemoryPacket(result);
    expect(packet.text).toMatch(/evidence=\d+ msgs?/);
    expect(packet.text).toContain('thread=thread-blue-room');
    expect(packet.text).toContain('source=episodes');
  });

  it('prefers provenance-backed episodes over journal proxies when ranking person recall', async () => {
    const result = await assembleWorkingMemory(
      { userId: 'user-1', question: 'What do you know about Alex?' },
      { maxItems: 8 }
    );

    const scene = result.episodes.find((item) => item.source === 'episodes');
    const journalProxy = result.episodes.find((item) => item.source === 'journal_entries');
    expect(scene).toBeDefined();
    if (journalProxy) {
      expect(scene!.score).toBeGreaterThanOrEqual(journalProxy.score);
    }
  });

  it('surfaces graduation episode evidence for event queries', async () => {
    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: "What happened at Morgan Gray's graduation?",
    });

    expect(result.intent).toBe('EVENT_QUERY');
    const grad = result.episodes.find(
      (item) => item.source === 'episodes' && /graduation|Morgan/i.test(`${item.title} ${item.content}`)
    );
    expect(grad).toBeDefined();
    expect(grad!.sourceMessageIds).toEqual(
      expect.arrayContaining(['msg-grad-1', 'msg-grad-2', 'msg-grad-3'])
    );
  });

  it('keeps character-table lookups bounded while assembling the full person dossier', async () => {
    fromMock.mockClear();
    await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Alex?' });
    const characterQueries = fromMock.mock.calls.filter(([table]) => table === 'characters').length;
    // The character compiler loads identity, aliases, memberships, and
    // relationship context through distinct projections. Guard against an
    // unbounded fan-out while allowing those intentionally separate reads.
    expect(characterQueries).toBeLessThanOrEqual(6);
  });

  it('reuses character cache for household relationship queries', async () => {
    fromMock.mockClear();
    await assembleWorkingMemory({ userId: 'user-1', question: 'Who lives with me?' });
    const characterQueries = fromMock.mock.calls.filter(([table]) => table === 'characters').length;
    expect(characterQueries).toBe(1);
    expect(fromMock.mock.calls.some(([table]) => table === 'character_relationships')).toBe(true);
    expect(fromMock.mock.calls.some(([table]) => table === 'entity_relationships')).toBe(true);
  });

  it('dedupes thread relationship groups across repeated messages', async () => {
    tableResults.chat_messages = {
      data: [
        {
          id: 'chat-rel-1',
          created_at: '2026-06-13T00:00:00Z',
          session_id: 'thread-rel',
          metadata: {
            ontology_enrichment: {
              relationship_groups: [
                { scope: 'FAMILY', entityNames: ['Marcus'], confidence: 0.9 },
              ],
            },
          },
        },
        {
          id: 'chat-rel-2',
          created_at: '2026-06-13T01:00:00Z',
          session_id: 'thread-rel',
          metadata: {
            ontology_enrichment: {
              relationship_groups: [
                { scope: 'FAMILY', entityNames: ['Marcus'], confidence: 0.88 },
              ],
            },
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'Tell me about my family',
      threadId: 'thread-rel',
    });

    const groupItems = result.relationships.filter((item) => item.source === 'thread_relationship_groups');
    expect(groupItems).toHaveLength(1);
  });

  it('includes entity relationship knowledge links from thread metadata', async () => {
    tableResults.chat_messages = {
      data: [
        {
          id: 'chat-rel-knowledge',
          created_at: '2026-06-14T00:00:00Z',
          session_id: 'thread-knowledge',
          metadata: {
            ontology_enrichment: {
              entity_relationship_knowledge: {
                Marcus: {
                  linkedEntities: [
                    {
                      name: 'self',
                      relationshipType: 'CO_MENTIONED_WITH',
                      scope: 'FAMILY',
                      role: 'cousin',
                    },
                  ],
                },
              },
            },
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'Who is Marcus to me?',
      threadId: 'thread-knowledge',
    });

    expect(
      result.relationships.some(
        (item) =>
          item.source === 'thread_entity_relationship_knowledge' &&
          /Marcus → self/i.test(item.title)
      )
    ).toBe(true);
  });

  it('records per-query timing breakdown', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'How is LifeLedger progressing?' });
    expect(result.timing).toBeDefined();
    expect(result.timing!.entityResolutionMs).toBeGreaterThanOrEqual(0);
    expect(result.timing!.candidateGenerationMs).toBeGreaterThanOrEqual(0);
    expect(result.timing!.rankingMs).toBeGreaterThanOrEqual(0);
    expect(result.timing!.queries.length).toBeGreaterThan(0);
    expect(result.timing!.queries.every((q) => q.table && q.purpose)).toBe(true);
  });

  it('assembles relationship context for Sam Chen', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What do you remember about Sam Chen?' });

    expect(result.intent).toBe('RELATIONSHIP_QUERY');
    expect(result.entities.some((entity) => entity.name === 'Sam Chen')).toBe(true);
    expect(result.relationships.some((item) => /romantic/i.test(item.content))).toBe(true);
  });

  it('surfaces thread relationship groups from pipeline metadata', async () => {
    tableResults.chat_messages = {
      data: [
        {
          id: 'chat-rel-1',
          created_at: '2026-06-13T00:00:00Z',
          session_id: 'thread-rel',
          metadata: {
            ontology_enrichment: {
              relationship_groups: [
                {
                  scope: 'FAMILY',
                  entityNames: ['Marcus', 'Grandma Rose'],
                  confidence: 0.88,
                  hint: 'FAMILY_RELATIONSHIP',
                },
              ],
            },
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'Who is in my family?',
      threadId: 'thread-rel',
    });

    expect(result.relationships.some((item) => item.source === 'thread_relationship_groups')).toBe(true);
    expect(result.relationships.some((item) => /FAMILY.*Marcus/i.test(item.title))).toBe(true);
  });

  it('loads persisted entity_relationship edges for relationship queries', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'Who lives with me?' });

    expect(result.relationships.some((item) => item.source === 'entity_relationships')).toBe(true);
    expect(result.relationships.some((item) => /Amazon/i.test(`${item.title} ${item.content}`))).toBe(true);
  });

  it('assembles place context for Blue Room', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What happened at Blue Room?' });

    expect(result.intent).toBe('PLACE_QUERY');
    expect(result.entities.some((entity) => entity.name === 'Blue Room')).toBe(true);
    expect([...result.episodes, ...result.timeline].some((item) => /Blue Room/i.test(item.content))).toBe(true);
  });

  it('assembles project context for LifeLedger', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'How is LifeLedger progressing?' });

    expect(result.intent).toBe('PROJECT_QUERY');
    expect(result.projects.some((item) => item.title === 'LifeLedger')).toBe(true);
    expect(result.episodes.some((item) => /LifeLedger/i.test(item.content))).toBe(true);
  });

  it('classifies career recall as a bounded career context', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What jobs have I had?' });

    expect(result.intent).toBe('CAREER_QUERY');
    expect(result.contextPlan.primary).toBe('career');
    expect(result.contextPlan.excluded).toContain('relationships');
    expect(result.contextDiagnostics.candidatesConsidered).toBeGreaterThan(0);
    expect(result.contextDiagnostics.coverageEstimate).toBeGreaterThanOrEqual(0);
    expect(result.contextDiagnostics.completenessEstimate).toBeLessThanOrEqual(1);
    expect(result.rejected.some((item) => item.rejectedReason.startsWith('context_') || item.rejectedReason.startsWith('outside_context:'))).toBe(true);
  });

  it('scopes a simple Northwind work-date question to the organization timeline', async () => {
    tableResults.organizations = {
      data: [{ id: 'org-northwind', name: 'Northwind', importance_score: 80 }],
      error: null,
    };
    const spy = vi.spyOn(stitchedTimelineService, 'getStitchedTimeline');

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When did I work at Northwind?',
    });

    expect(result.intent).toBe('CAREER_QUERY');
    expect(result.entities.some((entity) => entity.id === 'org-northwind')).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ organization_id: 'org-northwind', limit: 12 }),
    );
    spy.mockRestore();
  });

  it('keeps Amazon as an organization, not a person', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Amazon?' });

    expect(result.entities.some((entity) => entity.name === 'Amazon' && entity.type === 'ORGANIZATION')).toBe(true);
    expect(result.entities.every((entity) => entity.name !== 'Amazon' || entity.type !== 'PERSON')).toBe(true);
  });

  it('does not query people_places during entity resolution', async () => {
    await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Sam Chen?' });
    expect(fromMock).not.toHaveBeenCalledWith('people_places');
  });

  it.each([
    ['Alex', 'What do you know about Alex?', 'PERSON_QUERY'],
    ['Sam Chen', 'What do you remember about Sam Chen?', 'RELATIONSHIP_QUERY'],
    ['Grandma Rose', 'What do you know about Grandma Rose?', 'PERSON_QUERY'],
    ['Tio Juan', 'What do you know about Tio Juan?', 'PERSON_QUERY'],
    ['Morgan Gray', "What happened at Morgan Gray's graduation?", 'EVENT_QUERY'],
    ['Blue Room', 'What happened at Blue Room?', 'PLACE_QUERY'],
    ['LifeLedger', 'How is LifeLedger progressing?', 'PROJECT_QUERY'],
    ['Amazon', 'What do you know about Amazon?', 'PERSON_QUERY'],
    ['Costco', 'What happened at Costco?', 'PLACE_QUERY'],
  ])('evaluates target %s', async (target, question, expectedIntent) => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question });
    const selectedText = [
      ...result.episodes,
      ...result.events,
      ...result.projects,
      ...result.relationships,
      ...result.preferences,
      ...result.timeline,
    ].map((item) => `${item.title} ${item.content}`).join('\n');
    const rejectedText = result.rejected.map((item) => `${item.title} ${item.rejectedReason}`).join('\n');

    expect(result.intent).toBe(expectedIntent);
    expect(result.budget.selected).toBeLessThanOrEqual(20);
    expect(result.confidence).toBeGreaterThan(0);
    expect(selectedText.length + rejectedText.length).toBeGreaterThan(0);
    if (target === 'Amazon' || target === 'Costco') {
      expect(result.entities.every((entity) => entity.name !== target || entity.type !== 'PERSON')).toBe(true);
    }
  });

  it('surfaces event-query candidates from the canonical stitched timeline with correct provenance', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'resolved-graduation',
          title: "Morgan Gray's graduation",
          summary: 'Attended the graduation ceremony downtown.',
          type: 'graduation',
          start_time: '2026-06-11T00:00:00Z',
          confidence: 0.9,
          tags: [],
          // Morgan Gray resolves to char-leslie in the characters fixture above —
          // getStitchedTimeline's character_id scope only keeps resolved_events
          // rows that name the resolved character, matching real behavior.
          people: ['char-leslie'],
          locations: [],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: "What happened at Morgan Gray's graduation?",
    });

    expect(result.intent).toBe('EVENT_QUERY');
    const stitched = result.events.find((item) => item.source === 'stitched_timeline');
    expect(stitched).toBeDefined();
    expect(stitched?.content).toMatch(/graduation ceremony/i);
  });

  it('does not surface a resolved_events row that reads as a correction, not a lived event', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'resolved-correction',
          title: "That's wrong",
          summary: "That's wrong, please fix the date on this event.",
          type: 'note',
          start_time: '2026-06-11T00:00:00Z',
          confidence: 0.9,
          tags: [],
          // Same character (char-leslie) as the passing test above, so exclusion
          // here is provably from eligibility gating (CORRECTION speech act),
          // not incidentally from character_id scoping filtering it out.
          people: ['char-leslie'],
          locations: [],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: "What happened at Morgan Gray's graduation?",
    });

    const allText = [...result.events, ...result.timeline]
      .map((item) => `${item.title} ${item.content}`)
      .join('\n');
    // Eligibility gating (evaluateTimelineEligibility) excludes CORRECTION-classified
    // text from the canonical projector — chat now inherits this the same way the
    // Timeline/Swimlanes UI already does, which it did not before this change.
    expect(allText).not.toMatch(/please fix the date/i);
  });

  it('treats an active Character Book focus as authoritative and rejects unrelated life context', async () => {
    tableResults.journal_entries = {
      data: [{
        id: 'entry-unrelated-work',
        content: 'Worked a warehouse shift at a large retailer.',
        summary: 'Unrelated employment history',
        date: '2026-06-12T00:00:00Z',
        tags: ['work'],
        source: 'chat',
        metadata: {},
      }],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'Help me capture who he is.',
      focus: {
        id: 'char-sol',
        name: 'Sam Chen',
        type: 'character',
      },
    });

    expect(result.intent).toBe('PERSON_QUERY');
    expect(result.entities).toEqual([
      expect.objectContaining({ id: 'char-sol', name: 'Sam Chen', confidence: 1 }),
    ]);
    const selectedText = [
      ...result.episodes,
      ...result.events,
      ...result.relationships,
      ...result.timeline,
    ].map((item) => `${item.title} ${item.content}`).join('\n');
    expect(selectedText).toMatch(/Sam Chen/i);
    expect(selectedText).not.toMatch(/warehouse shift|employment history/i);
    expect(result.rejected.some((item) => item.rejectedReason === 'active_focus_mismatch:char-sol')).toBe(true);
  });

  it('surfaces canonical stitched org events, not entity_timeline_events dates', async () => {
    tableResults.entity_timeline_events = {
      data: [
        {
          id: 'ev-org-legacy',
          event_title: 'Legacy offsite date',
          event_type: 'gathering',
          event_date: '2026-06-12',
          event_summary: 'Legacy compatibility date that must not become when.',
          confidence: 0.85,
          metadata: { significance_score: 70 },
        },
      ],
      error: null,
    };
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-acme-start',
          title: 'Started at Acme',
          summary: 'First week onboarding at Acme.',
          type: 'work',
          start_time: '2026-08-10T18:00:00.000Z',
          created_at: '2026-08-12T00:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: [],
          metadata: {
            organizationAttributions: [
              {
                organizationId: 'org-acme',
                organizationName: 'Acme',
                role: 'employer',
                evidence: 'Started at Acme',
                evidenceKind: 'direct',
                confidence: 0.9,
                accepted: true,
                canonical: true,
                acceptedForOrganizationTimeline: true,
                direct: true,
                whyIncluded: 'Explicit work/employer context',
                protagonistRelation: true,
                unresolved: false,
              },
            ],
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: "What's been happening with Acme?",
      focus: {
        id: 'org-acme',
        name: 'Acme',
        type: 'organization',
      },
    });

    expect(result.intent).toBe('COMMUNITY_QUERY');
    expect(fromMock).not.toHaveBeenCalledWith('entity_timeline_events');
    const stitched = [...result.events, ...result.timeline].filter((item) => item.source === 'stitched_timeline');
    expect(stitched.some((item) => /First week onboarding at Acme/i.test(item.content))).toBe(true);
    expect(stitched.find((item) => /onboarding at Acme/i.test(item.content))?.date).toBe('2026-08-10T18:00:00.000Z');
    expect(stitched.find((item) => /onboarding at Acme/i.test(item.content))?.metadata?.usage).toBe('canonical_occurrence');
    const selectedText = [...result.episodes, ...result.events, ...result.timeline]
      .map((item) => `${item.title} ${item.content} ${item.date ?? ''}`)
      .join('\n');
    expect(selectedText).not.toMatch(/Legacy compatibility date/i);
    expect(selectedText).not.toMatch(/2026-06-12/);
  });

  it('surfaces canonical stitched location events, not entity_timeline_events dates', async () => {
    tableResults.entity_timeline_events = {
      data: [
        {
          id: 'ev-loc-legacy',
          event_title: 'Visit to Northwind Depot',
          event_type: 'visit',
          event_date: '2026-06-12',
          event_summary: 'Legacy depot date that must not become when.',
          confidence: 0.8,
          metadata: { significance_score: 65 },
        },
      ],
      error: null,
    };
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-depot-night',
          title: 'Shift at Northwind Depot',
          summary: 'A memorable night that started everything at Northwind Depot.',
          type: 'visit',
          start_time: '2026-08-10T18:00:00.000Z',
          created_at: '2026-08-12T00:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: ['loc-depot'],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: "What's happened at this place?",
      focus: {
        id: 'loc-depot',
        name: 'Northwind Depot',
        type: 'location',
      },
    });

    expect(fromMock).not.toHaveBeenCalledWith('entity_timeline_events');
    const stitched = [...result.events, ...result.timeline].find((item) => item.source === 'stitched_timeline');
    expect(stitched?.content).toMatch(/memorable night that started everything/i);
    expect(stitched?.date).toBe('2026-08-10T18:00:00.000Z');
    expect(stitched?.metadata?.usage).toBe('canonical_occurrence');
    const selectedText = [...result.episodes, ...result.events, ...result.timeline]
      .map((item) => `${item.title} ${item.content} ${item.date ?? ''}`)
      .join('\n');
    expect(selectedText).not.toMatch(/Legacy depot date/i);
  });

  it('does not surface entity_timeline_events rows for character focus', async () => {
    tableResults.entity_timeline_events = {
      data: [
        {
          id: 'ev-org-leak',
          event_title: 'Should not leak into character focus',
          event_type: 'gathering',
          event_date: '2026-06-10',
          event_summary: 'This row belongs to an organization, not the focused character.',
          confidence: 0.9,
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'Tell me about him.',
      focus: {
        id: 'char-sol',
        name: 'Sam Chen',
        type: 'character',
      },
    });

    expect(fromMock).not.toHaveBeenCalledWith('entity_timeline_events');
    const selectedText = [...result.episodes, ...result.events, ...result.timeline]
      .map((item) => `${item.title} ${item.content}`)
      .join('\n');
    expect(selectedText).not.toMatch(/Should not leak into character focus/i);
  });

  it('does not fabricate a when from a legacy-only org row', async () => {
    tableResults.entity_timeline_events = {
      data: [
        {
          id: 'ev-org-only',
          event_title: 'Phantom Acme interview',
          event_type: 'interview',
          event_date: '2026-07-04',
          event_summary: 'Legacy row claiming an Acme interview on July 4.',
          confidence: 0.99,
          metadata: {},
        },
      ],
      error: null,
    };
    tableResults.resolved_events = { data: [], error: null };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened during my time at Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });

    const selected = [...result.events, ...result.timeline];
    expect(selected.some((item) => item.metadata?.usage === 'empty_canonical_chronology')).toBe(true);
    expect(selected.every((item) => item.date !== '2026-07-04')).toBe(true);
    expect(selected.map((item) => item.content).join('\n')).not.toMatch(/Phantom Acme interview|July 4/i);
  });

  it('does not treat a referenced organization mention as participation', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-think-acme',
          title: 'Thinking about Acme',
          summary: 'I was thinking about Acme after the movie.',
          start_time: '2026-08-10T18:00:00.000Z',
          confidence: 0.8,
          tags: [],
          people: [],
          locations: [],
          metadata: {
            organizationAttributions: [
              {
                organizationId: 'org-acme',
                organizationName: 'Acme',
                role: 'referenced',
                evidence: 'thinking about Acme',
                evidenceKind: 'mention',
                confidence: 0.5,
                accepted: false,
                canonical: false,
                acceptedForOrganizationTimeline: false,
                direct: true,
                whyIncluded: 'Referenced only — not organization participation',
                protagonistRelation: false,
                unresolved: false,
              },
            ],
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });

    const stitched = [...result.events, ...result.timeline].filter(
      (item) => item.source === 'stitched_timeline' && item.metadata?.usage === 'canonical_occurrence',
    );
    expect(stitched).toHaveLength(0);
    expect(result.events.some((item) => item.metadata?.usage === 'empty_canonical_chronology')).toBe(true);
  });

  it('does not treat member-overlap people as an organization event', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-jamie-dinner',
          title: 'Dinner with Jamie',
          summary: 'Had dinner with Jamie, who happens to work at Acme.',
          start_time: '2026-08-10T18:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: ['char-jamie'],
          locations: [],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });

    expect(
      [...result.events, ...result.timeline].some(
        (item) => item.source === 'stitched_timeline' && /Dinner with Jamie/i.test(item.content),
      ),
    ).toBe(false);
  });

  it('does not treat a mentioned place as a visited place', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-catch-one',
          title: 'Night at Catch One',
          summary: 'I was at Catch One and talked about Disneyland.',
          start_time: '2026-08-10T18:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: ['loc-catch-one'],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When was I at Disneyland?',
      focus: { id: 'loc-disneyland', name: 'Disneyland', type: 'location' },
    });

    expect(
      [...result.events, ...result.timeline].some(
        (item) => item.source === 'stitched_timeline' && item.metadata?.usage === 'canonical_occurrence',
      ),
    ).toBe(false);
    expect(result.events.some((item) => item.metadata?.usage === 'empty_canonical_chronology')).toBe(true);
  });

  it('does not use firstVisited, lastVisited, or created_at as occurrence', async () => {
    tableResults.locations = {
      data: [
        {
          id: 'loc-depot',
          name: 'Northwind Depot',
          importance_score: 65,
          firstVisited: '2020-01-01',
          lastVisited: '2026-12-31',
        },
      ],
      error: null,
    };
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-depot-shift',
          title: 'Night shift at Northwind Depot',
          summary: 'Worked a night shift at Northwind Depot.',
          start_time: '2026-08-10T18:00:00.000Z',
          created_at: '2026-08-21T00:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: ['loc-depot'],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When was I at Northwind Depot?',
      focus: { id: 'loc-depot', name: 'Northwind Depot', type: 'location' },
    });

    const stitched = [...result.events, ...result.timeline].find(
      (item) => item.source === 'stitched_timeline' && item.metadata?.usage === 'canonical_occurrence',
    );
    expect(stitched?.date).toBe('2026-08-10T18:00:00.000Z');
    expect(stitched?.date).not.toBe('2020-01-01');
    expect(stitched?.date).not.toBe('2026-12-31');
    expect(stitched?.date).not.toBe('2026-08-21T00:00:00.000Z');
  });

  it('scopes when-was-I-at questions to the focused location id', async () => {
    const spy = vi.spyOn(stitchedTimelineService, 'getStitchedTimeline');
    tableResults.resolved_events = { data: [], error: null };

    await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When was I at Northwind Depot?',
      focus: { id: 'loc-depot', name: 'Northwind Depot', type: 'location' },
    });

    expect(spy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ location_id: 'loc-depot' }),
    );
    expect(spy.mock.calls.some((call) => 'organization_id' in (call[1] ?? {}) && call[1]?.organization_id)).toBe(false);
    spy.mockRestore();
  });

  it('scopes during-my-time-at questions to the focused organization id', async () => {
    const spy = vi.spyOn(stitchedTimelineService, 'getStitchedTimeline');
    tableResults.resolved_events = { data: [], error: null };

    await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened during my time at Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });

    expect(spy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ organization_id: 'org-acme' }),
    );
    expect(spy.mock.calls.some((call) => call[1]?.location_id)).toBe(false);
    spy.mockRestore();
  });

  it('does not mix parent-organization attribution as a direct occurrence role', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-child-team',
          title: 'Standup with the platform team',
          summary: 'Platform team standup at Vanguard Robotics.',
          start_time: '2026-08-10T18:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: [],
          metadata: {
            organizationAttributions: [
              {
                organizationId: 'org-vanguard-parent',
                organizationName: 'Vanguard Robotics',
                role: 'parent_context',
                evidence: 'derived from platform team',
                evidenceKind: 'parent',
                confidence: 0.7,
                accepted: true,
                canonical: true,
                acceptedForOrganizationTimeline: true,
                direct: false,
                derivedFrom: 'org-platform-team',
                whyIncluded: 'Parent context derived from platform team',
                protagonistRelation: true,
                unresolved: false,
              },
            ],
          },
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Vanguard Robotics?',
      focus: { id: 'org-vanguard-parent', name: 'Vanguard Robotics', type: 'organization' },
    });

    const stitched = [...result.events, ...result.timeline].find(
      (item) => item.source === 'stitched_timeline' && /Standup with the platform team/i.test(item.title),
    );
    expect(stitched).toBeDefined();
    expect(stitched?.metadata?.entityRole).toBe('parent_context');
    expect(stitched?.metadata?.attributionDirect).toBe(false);
  });

  it('can still surface journal mentions as subject reference, not occurrence', async () => {
    tableResults.journal_entries = {
      data: [
        {
          id: 'entry-think-acme',
          summary: 'Thinking about Acme',
          content: 'I was thinking about Acme after the movie.',
          date: '2026-08-09T00:00:00.000Z',
          tags: [],
          source: 'manual',
          metadata: {},
        },
      ],
      error: null,
    };
    tableResults.resolved_events = { data: [], error: null };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What do you know about Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });

    const journal = result.episodes.find((item) => item.source === 'journal_entries');
    expect(journal?.metadata?.usage).toBe('subject_reference');
    expect(journal?.reasons.some((reason) => /subject mention, not occurrence/i.test(reason))).toBe(true);
    expect(result.events.some((item) => item.metadata?.usage === 'canonical_occurrence')).toBe(false);

    const packet = buildWorkingMemoryPacket(result);
    expect(packet.text).toMatch(/usage=empty_canonical_chronology|No verified timeline events/);
    expect(packet.text).toMatch(/usage=subject_reference/);
  });

  it('picks up a temporal correction on the next assembly', async () => {
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-depot-shift',
          title: 'Night at Northwind Depot',
          summary: 'Worked a night at Northwind Depot.',
          start_time: '2026-08-10T18:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: ['loc-depot'],
          metadata: {},
        },
      ],
      error: null,
    };

    const first = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When was I at Northwind Depot?',
      focus: { id: 'loc-depot', name: 'Northwind Depot', type: 'location' },
    });
    expect(
      [...first.events, ...first.timeline].find((item) => item.metadata?.usage === 'canonical_occurrence')?.date,
    ).toBe('2026-08-10T18:00:00.000Z');

    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-depot-shift',
          title: 'Night at Northwind Depot',
          summary: 'Worked a night at Northwind Depot.',
          start_time: '2026-08-14T18:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: [],
          locations: ['loc-depot'],
          metadata: {},
        },
      ],
      error: null,
    };

    const second = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When was I at Northwind Depot?',
      focus: { id: 'loc-depot', name: 'Northwind Depot', type: 'location' },
    });
    expect(
      [...second.events, ...second.timeline].find((item) => item.metadata?.usage === 'canonical_occurrence')?.date,
    ).toBe('2026-08-14T18:00:00.000Z');
  });

  it('picks up an organization attribution correction on the next assembly', async () => {
    const event = {
      id: 'evt-interview',
      title: 'Interviewed at Acme',
      summary: 'Interviewed with the Acme recruiting team.',
      start_time: '2026-08-10T18:00:00.000Z',
      confidence: 0.9,
      tags: [] as string[],
      people: [] as string[],
      locations: [] as string[],
      metadata: {
        organizationAttributions: [
          {
            organizationId: 'org-northwind-labs',
            organizationName: 'Northwind Labs',
            role: 'interview_target',
            evidence: 'wrong org',
            evidenceKind: 'direct',
            confidence: 0.9,
            accepted: true,
            canonical: true,
            acceptedForOrganizationTimeline: true,
            direct: true,
            whyIncluded: 'Professional interview context',
            protagonistRelation: true,
            unresolved: false,
          },
        ],
      },
    };
    tableResults.resolved_events = { data: [event], error: null };

    const before = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });
    expect(
      [...before.events, ...before.timeline].some(
        (item) => item.source === 'stitched_timeline' && /Interviewed with the Acme recruiting team/i.test(item.content),
      ),
    ).toBe(false);

    tableResults.resolved_events = {
      data: [
        {
          ...event,
          metadata: {
            organizationAttributions: [
              {
                ...event.metadata.organizationAttributions[0],
                organizationId: 'org-acme',
                organizationName: 'Acme',
              },
            ],
          },
        },
      ],
      error: null,
    };

    const after = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Acme?',
      focus: { id: 'org-acme', name: 'Acme', type: 'organization' },
    });
    expect(
      [...after.events, ...after.timeline].some(
        (item) => item.source === 'stitched_timeline' && /Interviewed with the Acme recruiting team/i.test(item.content),
      ),
    ).toBe(true);
  });

  it('keeps tenant-scoped stitched retrieval on the requesting user', async () => {
    const spy = vi.spyOn(stitchedTimelineService, 'getStitchedTimeline');
    tableResults.resolved_events = { data: [], error: null };

    await assembleWorkingMemory({
      userId: 'user-1',
      question: "What's happened at this place?",
      focus: { id: 'loc-depot', name: 'Northwind Depot', type: 'location' },
    });

    expect(spy).toHaveBeenCalledWith('user-1', expect.anything());
    expect(spy).not.toHaveBeenCalledWith('user-2', expect.anything());
    spy.mockRestore();
  });

  it('scopes Maya when-questions to character_id and uses occurredStart, not character_timeline_events dates', async () => {
    tableResults.characters = {
      data: [
        ...(tableResults.characters.data ?? []),
        {
          id: 'char-maya',
          name: 'Maya',
          alias: [],
          summary: 'Friend from MemoVault.',
          importance_score: 70,
          metadata: {},
          updated_at: '2026-08-21T00:00:00Z',
        },
      ],
      error: null,
    };
    tableResults.character_timeline_events = {
      data: [
        {
          id: 'cte-maya-lie',
          event_title: 'Fake Maya date',
          event_type: 'meetup',
          event_date: '1999-01-01',
          event_summary: 'This legacy date must not become occurrence.',
          created_at: '2026-08-21T00:00:00Z',
          confidence: 0.99,
        },
      ],
      error: null,
    };
    tableResults.resolved_events = {
      data: [
        {
          id: 'evt-maya-dinner',
          title: 'Dinner with Maya',
          summary: 'Had dinner with Maya at Northwind Depot.',
          start_time: '2026-07-12T02:30:00.000Z',
          created_at: '2026-08-21T00:00:00.000Z',
          confidence: 0.9,
          tags: [],
          people: ['char-maya'],
          locations: [],
          metadata: {},
        },
      ],
      error: null,
    };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When did I last see Maya?',
      focus: { id: 'char-maya', name: 'Maya', type: 'character' },
    });

    const stitched = [...result.events, ...result.timeline].find(
      (item) => item.source === 'stitched_timeline' && item.metadata?.usage === 'canonical_occurrence',
    );
    expect(stitched?.metadata?.canonicalItemId).toBe('event:evt-maya-dinner');
    expect(stitched?.date).toBe('2026-07-12T02:30:00.000Z');
    expect(stitched?.date).not.toBe('1999-01-01');
    expect(stitched?.date).not.toBe('2026-08-21T00:00:00.000Z');
    expect(result.events.some((item) => item.source === 'character_timeline_events')).toBe(false);
  });

  it('scopes Maya chronology to character_id rather than a global timeline', async () => {
    const spy = vi.spyOn(stitchedTimelineService, 'getStitchedTimeline');
    tableResults.characters = {
      data: [
        ...(tableResults.characters.data ?? []),
        { id: 'char-maya', name: 'Maya', alias: [], summary: '', importance_score: 70, metadata: {}, updated_at: '2026-08-21T00:00:00Z' },
      ],
      error: null,
    };
    tableResults.resolved_events = { data: [], error: null };

    await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What happened with Maya in July?',
      focus: { id: 'char-maya', name: 'Maya', type: 'character' },
    });

    expect(spy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ character_id: 'char-maya' }),
    );
    expect(spy.mock.calls.some((call) => call[1]?.location_id)).toBe(false);
    spy.mockRestore();
  });

  it('keeps empty Maya chronology empty instead of filling from legacy event_date', async () => {
    tableResults.characters = {
      data: [
        ...(tableResults.characters.data ?? []),
        { id: 'char-maya', name: 'Maya', alias: [], summary: '', importance_score: 70, metadata: {}, updated_at: '2026-08-21T00:00:00Z' },
      ],
      error: null,
    };
    tableResults.character_timeline_events = {
      data: [{ id: 'cte-empty', event_title: 'Invented meetup', event_date: '2021-05-05', created_at: '2021-05-06' }],
      error: null,
    };
    tableResults.resolved_events = { data: [], error: null };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'When did Maya and I go to Northwind Depot?',
      focus: { id: 'char-maya', name: 'Maya', type: 'character' },
    });

    expect(result.events.some((item) => item.metadata?.usage === 'empty_canonical_chronology')).toBe(true);
    expect(result.events.some((item) => item.source === 'character_timeline_events')).toBe(false);
    expect(result.events.some((item) => item.date === '2021-05-05')).toBe(false);
  });

  it('resolves current-state Maya questions from relationship history, not chronology dates', async () => {
    tableResults.characters = {
      data: [
        ...(tableResults.characters.data ?? []),
        { id: 'char-maya', name: 'Maya', alias: [], summary: '', importance_score: 70, metadata: {}, updated_at: '2026-08-21T00:00:00Z' },
      ],
      error: null,
    };
    tableResults.character_relationships = {
      data: [
        {
          id: 'rel-maya',
          relationship_type: 'friend',
          status: 'active',
          source_character_id: 'self',
          target_character_id: 'char-maya',
          summary: 'Maya is a close friend.',
        },
      ],
      error: null,
    };
    tableResults.resolved_events = { data: [], error: null };

    const result = await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What is Maya to me?',
      focus: { id: 'char-maya', name: 'Maya', type: 'character' },
    });

    expect(fromMock.mock.calls.some(([table]) =>
      table === 'character_relationships' || table === 'character_relationship_history',
    )).toBe(true);
    expect(result.events.some((item) => item.source === 'character_timeline_events')).toBe(false);
    const packet = buildWorkingMemoryPacket(result);
    const relationshipText = [
      packet.text,
      ...result.relationships.map((item) => `${item.title} ${item.content}`),
    ].join('\n').toLowerCase();
    expect(relationshipText).toMatch(/friend|relationship/);
  });

  it('resolves temporal queries in the user\'s own timezone, not the server\'s', async () => {
    // Regression test: classifyTemporalQuery was previously called with no
    // timezone at all, so "what did I do yesterday" always resolved against
    // the server process's own local day instead of the user's.
    getUserTimezoneMock.mockResolvedValueOnce('America/Los_Angeles');

    await assembleWorkingMemory({
      userId: 'user-1',
      question: 'What did I do yesterday?',
    });

    expect(getUserTimezoneMock).toHaveBeenCalledWith('user-1');
  });
});

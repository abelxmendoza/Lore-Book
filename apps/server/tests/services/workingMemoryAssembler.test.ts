import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: any; error: unknown; count?: number };

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    ilike: () => chain,
    or: () => chain,
    in: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
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

import { assembleWorkingMemory, buildWorkingMemoryPacket } from '../../src/services/chat/workingMemoryAssembler';

describe('Working Memory Assembler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      people_places: {
        data: [
          { id: 'pp-metro', name: 'Blue Room', type: 'place', corrected_names: [] },
          { id: 'pp-costco', name: 'Costco', type: 'organization', corrected_names: [] },
        ],
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
    };
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

  it('avoids duplicate character table queries for person queries', async () => {
    fromMock.mockClear();
    await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Alex?' });
    const characterQueries = fromMock.mock.calls.filter(([table]) => table === 'characters').length;
    expect(characterQueries).toBeLessThanOrEqual(1);
  });

  it('reuses character cache for household relationship queries', async () => {
    fromMock.mockClear();
    await assembleWorkingMemory({ userId: 'user-1', question: 'Who lives with me?' });
    const characterQueries = fromMock.mock.calls.filter(([table]) => table === 'characters').length;
    expect(characterQueries).toBe(1);
    expect(fromMock.mock.calls.some(([table]) => table === 'character_relationships')).toBe(true);
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

  it('keeps Amazon as an organization, not a person', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Amazon?' });

    expect(result.entities.some((entity) => entity.name === 'Amazon' && entity.type === 'ORGANIZATION')).toBe(true);
    expect(result.entities.every((entity) => entity.name !== 'Amazon' || entity.type !== 'PERSON')).toBe(true);
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
});

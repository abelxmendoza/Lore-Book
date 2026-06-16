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

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null })),
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
            name: 'Ashley De La Cruz',
            alias: ['Ashley'],
            summary: 'Met after Club Metro.',
            importance_score: 72,
            metadata: {
              al_biography: { narrative_summary: 'Ashley was a short but memorable Club Metro chapter.' },
            },
            updated_at: '2026-06-10T00:00:00Z',
          },
          {
            id: 'char-sol',
            name: 'Sol',
            alias: [],
            summary: 'A relationship thread with unresolved emotion.',
            importance_score: 80,
            metadata: {},
            updated_at: '2026-06-11T00:00:00Z',
          },
          {
            id: 'char-abuela',
            name: 'Abuela',
            alias: [],
            summary: 'Family anchor.',
            importance_score: 90,
            metadata: {},
            updated_at: '2026-06-09T00:00:00Z',
          },
          {
            id: 'char-tio-juan',
            name: 'Tio Juan',
            alias: ['Tío Juan'],
            summary: 'Family member connected to family stories.',
            importance_score: 70,
            metadata: {},
            updated_at: '2026-06-08T00:00:00Z',
          },
          {
            id: 'char-leslie',
            name: 'Leslie',
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
        data: [{ id: 'loc-metro', name: 'Club Metro', importance_score: 65 }],
        error: null,
      },
      organizations: {
        data: [{ id: 'org-amazon', name: 'Amazon', importance_score: 40 }],
        error: null,
      },
      people_places: {
        data: [
          { id: 'pp-metro', name: 'Club Metro', type: 'place', corrected_names: [] },
          { id: 'pp-costco', name: 'Costco', type: 'organization', corrected_names: [] },
        ],
        error: null,
      },
      projects: {
        data: [
          {
            id: 'proj-lorebook',
            name: 'LoreBook',
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
            summary: 'Ashley and I met after Club Metro in DTLA.',
            journal_entry_id: 'entry-ashley',
            created_at: '2026-06-10T00:00:00Z',
          },
          {
            id: 'mem-sol',
            summary: 'Sol came up as an emotionally complicated relationship memory.',
            journal_entry_id: 'entry-sol',
            created_at: '2026-06-11T00:00:00Z',
          },
          {
            id: 'mem-family',
            summary: 'Abuela and Tio Juan appeared in a family memory.',
            journal_entry_id: 'entry-family',
            created_at: '2026-06-09T00:00:00Z',
          },
          {
            id: 'mem-leslie',
            summary: "Leslie's graduation was a remembered event.",
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
            event_title: 'Ashley after Club Metro',
            event_type: 'romantic_scene',
            event_date: '2026-06-10',
            event_summary: 'Met Ashley after Club Metro and spent time together.',
            significance_score: 72,
            confidence: 0.86,
          },
          {
            id: 'ev-lorebook',
            event_title: 'LoreBook retrieval sprint',
            event_type: 'project_progress',
            event_date: '2026-06-12',
            event_summary: 'Working Memory Assembler design started.',
            significance_score: 80,
            confidence: 0.9,
          },
          {
            id: 'ev-leslie',
            event_title: "Leslie's graduation",
            event_type: 'graduation',
            event_date: '2026-06-07',
            event_summary: "Leslie's graduation was a family/social milestone.",
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
          { id: 'fact-ashley', fact: 'Ashley was connected to Club Metro.', confidence: 0.88, updated_at: '2026-06-10T00:00:00Z' },
          { id: 'fact-sol', fact: 'Sol is relationship-relevant, not project context.', confidence: 0.8, updated_at: '2026-06-11T00:00:00Z' },
        ],
        error: null,
      },
      journal_entries: {
        data: [
          {
            id: 'entry-metro',
            summary: 'Club Metro night',
            content: 'At Club Metro I met Ashley and the night became a memorable scene.',
            date: '2026-06-10T00:00:00Z',
            tags: ['significant'],
            source: 'manual',
            metadata: {},
          },
          {
            id: 'entry-lorebook',
            summary: 'LoreBook progress',
            content: 'LoreBook is progressing through context assembly and retrieval design.',
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
            content: 'Did you save Ashley after Club Metro?',
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
            narrative_text: 'You are building LoreBook while tracking relationships and family memory.',
            metadata: {},
            recorded_at: '2026-06-12T00:00:00Z',
          },
        ],
        error: null,
      },
    };
  });

  it('assembles a person working memory for Ashley without pulling unrelated context when budgeted', async () => {
    const result = await assembleWorkingMemory(
      { userId: 'user-1', question: 'What do you know about Ashley?' },
      { maxItems: 6 }
    );

    expect(result.intent).toBe('PERSON_QUERY');
    expect(result.entities.some((entity) => entity.name.includes('Ashley'))).toBe(true);
    expect(result.episodes.some((item) => /Ashley|Club Metro/i.test(item.content))).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.budget.selected).toBeLessThanOrEqual(6);
    expect(result.rejected.length).toBeGreaterThan(0);

    const packet = buildWorkingMemoryPacket(result);
    expect(packet.text).toContain('WORKING MEMORY PACKET');
    expect(packet.text).toContain('source=');
    expect(packet.text).toContain('confidence=');
    expect(packet.text).toContain('score=');
    expect(packet.text).toContain('reason=');
  });

  it('assembles relationship context for Sol', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What do you remember about Sol?' });

    expect(result.intent).toBe('RELATIONSHIP_QUERY');
    expect(result.entities.some((entity) => entity.name === 'Sol')).toBe(true);
    expect(result.relationships.some((item) => /romantic/i.test(item.content))).toBe(true);
  });

  it('assembles place context for Club Metro', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What happened at Club Metro?' });

    expect(result.intent).toBe('PLACE_QUERY');
    expect(result.entities.some((entity) => entity.name === 'Club Metro')).toBe(true);
    expect([...result.episodes, ...result.timeline].some((item) => /Club Metro/i.test(item.content))).toBe(true);
  });

  it('assembles project context for LoreBook', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'How is LoreBook progressing?' });

    expect(result.intent).toBe('PROJECT_QUERY');
    expect(result.projects.some((item) => item.title === 'LoreBook')).toBe(true);
    expect(result.episodes.some((item) => /LoreBook/i.test(item.content))).toBe(true);
  });

  it('keeps Amazon as an organization, not a person', async () => {
    const result = await assembleWorkingMemory({ userId: 'user-1', question: 'What do you know about Amazon?' });

    expect(result.entities.some((entity) => entity.name === 'Amazon' && entity.type === 'ORGANIZATION')).toBe(true);
    expect(result.entities.every((entity) => entity.name !== 'Amazon' || entity.type !== 'PERSON')).toBe(true);
  });

  it.each([
    ['Ashley', 'What do you know about Ashley?', 'PERSON_QUERY'],
    ['Sol', 'What do you remember about Sol?', 'RELATIONSHIP_QUERY'],
    ['Abuela', 'What do you know about Abuela?', 'PERSON_QUERY'],
    ['Tio Juan', 'What do you know about Tio Juan?', 'PERSON_QUERY'],
    ['Leslie', "What happened at Leslie's graduation?", 'EVENT_QUERY'],
    ['Club Metro', 'What happened at Club Metro?', 'PLACE_QUERY'],
    ['LoreBook', 'How is LoreBook progressing?', 'PROJECT_QUERY'],
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown };
let tables: string[] = [];
let tableResults: Record<string, TableResult> = {};

function makeChain(table: string, result: TableResult) {
  tables.push(table);
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'or', 'order', 'single']) {
    chain[key] = () => chain;
  }
  (chain as { single: () => Promise<TableResult> }).single = () => Promise.resolve(result);
  chain.then = (resolve: (v: TableResult) => void) => resolve(result);
  return chain;
}

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(table, tableResults[table] ?? { data: [], error: null })),
  },
}));

vi.mock('../temporal/journalMemoryTemporalLoader', () => ({
  mapCharacterMemoriesToTemporalRefs: vi.fn(async (_userId: string, memories: Array<{ created_at: string | null }>) =>
    memories.map((mem) => ({ occurredAt: mem.created_at })),
  ),
}));

const buildCanonicalCharacterTimeline = vi.fn();
vi.mock('./characterEntityTimelineService', () => ({
  buildCanonicalCharacterTimeline: (...args: unknown[]) => buildCanonicalCharacterTimeline(...args),
}));

import { buildCharacterBiography } from './characterBiographyService';

const USER = 'user-1';
const MAYA = 'char-maya';

describe('character biography after character_timeline_events drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tables = [];
    tableResults = {
      characters: { data: { name: 'Maya', summary: null, metadata: {} }, error: null },
      character_relationships: { data: [], error: null },
      character_memories: { data: [], error: null },
    };
    buildCanonicalCharacterTimeline.mockResolvedValue({
      sharedExperiences: [{ eventTitle: 'Dinner with Maya' }],
      lore: [],
      unresolved: [],
      legacyOnly: [],
      summary: {
        firstKnownOccurrenceAt: '2026-07-12T19:30:00.000Z',
        lastKnownOccurrenceAt: '2026-07-12T19:30:00.000Z',
        firstMentionedAt: '2026-06-01T12:00:00.000Z',
        lastMentionedAt: '2026-08-21T12:00:00.000Z',
        firstKnownAppearanceAt: '2026-07-12T19:30:00.000Z',
        lastInteractionAt: '2026-07-12T19:30:00.000Z',
      },
    });
  });

  it('reads canonical timeline instead of character_timeline_events', async () => {
    const bio = await buildCharacterBiography(USER, MAYA);
    expect(tables).not.toContain('character_timeline_events');
    expect(buildCanonicalCharacterTimeline).toHaveBeenCalledWith(USER, MAYA);
    expect(bio?.firstSeen).toBe('2026-07-12T19:30:00.000Z');
    expect(bio?.lastSeen).toBe('2026-07-12T19:30:00.000Z');
    expect(bio?.majorMoments).toContain('Dinner with Maya');
  });

  it('first/last occurrence match Character Timeline, not card first_appearance or recording time', async () => {
    tableResults.characters = {
      data: {
        name: 'Maya Chen',
        summary: null,
        created_at: '2026-08-21T12:00:00.000Z',
        first_appearance: '1999-01-01T00:00:00.000Z',
        metadata: {},
      },
      error: null,
    };
    buildCanonicalCharacterTimeline.mockResolvedValue({
      sharedExperiences: [{ eventTitle: 'Met Maya Chen at Northwind Labs' }],
      lore: [],
      unresolved: [{ eventTitle: 'Something about Maya, no date' }],
      legacyOnly: [],
      summary: {
        firstKnownOccurrenceAt: '2024-03-15T00:00:00.000Z',
        lastKnownOccurrenceAt: '2025-08-01T00:00:00.000Z',
        firstMentionedAt: '2026-08-21T12:00:00.000Z',
        lastMentionedAt: '2026-08-21T12:00:00.000Z',
        firstKnownAppearanceAt: '2024-03-15T00:00:00.000Z',
        lastInteractionAt: '2025-08-01T00:00:00.000Z',
      },
    });

    const bio = await buildCharacterBiography(USER, MAYA);
    expect(bio?.firstSeen).toBe('2024-03-15T00:00:00.000Z');
    expect(bio?.lastSeen).toBe('2025-08-01T00:00:00.000Z');
    expect(bio?.firstSeen).not.toBe('1999-01-01T00:00:00.000Z');
    expect(bio?.firstSeen).not.toBe('2026-08-21T12:00:00.000Z');
  });
});

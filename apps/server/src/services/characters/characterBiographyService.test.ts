import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown };
let tableResults: Record<string, TableResult> = {};

function makeChain(result: TableResult) {
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
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null })),
  },
}));

const buildCanonicalCharacterTimeline = vi.fn();
vi.mock('./characterEntityTimelineService', () => ({
  buildCanonicalCharacterTimeline: (...args: unknown[]) => buildCanonicalCharacterTimeline(...args),
}));

import { buildCharacterBiography } from './characterBiographyService';
import { formatCharacterMemoryProfileForChat } from './characterMemoryProfileService';

const USER = 'user-1';
const MAYA = 'char-maya';

describe('character biography occurrence clocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      characters: { data: { name: 'Maya', summary: null, metadata: {} }, error: null },
      character_relationships: { data: [], error: null },
      character_memories: { data: [{ summary: 'Talked about Maya', created_at: '2026-08-21T00:00:00.000Z' }], error: null },
    };
  });

  it('CASE A: canonical July beats hostile legacy January 1999', async () => {
    buildCanonicalCharacterTimeline.mockResolvedValue({
      sharedExperiences: [{
        eventTitle: 'Dinner with Maya',
        occurredStart: '2026-07-12T19:30:00.000Z',
        isUnresolved: false,
        canonicalItemId: 'event:evt-dinner',
        eventId: 'evt-dinner',
        precision: 'day',
        timelineType: 'shared_experience',
        connectionCharacter: 'Maya',
        confidence: 0.9,
        eventSummary: 'Dinner',
      }],
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

    const bio = await buildCharacterBiography(USER, MAYA);
    expect(bio?.firstKnownOccurrence).toBe('2026-07-12T19:30:00.000Z');
    expect(bio?.firstKnownOccurrence).not.toContain('1999');
    expect(bio?.firstMentionedAt).toBe('2026-06-01T12:00:00.000Z');
    expect(bio?.firstKnownOccurrence).not.toBe(bio?.firstMentionedAt);
  });

  it('CASE B: unknown occurrence stays unknown despite legacy date', async () => {
    buildCanonicalCharacterTimeline.mockResolvedValue({
      sharedExperiences: [],
      lore: [],
      unresolved: [{
        eventTitle: 'Dinner with Maya',
        occurredStart: null,
        isUnresolved: true,
        canonicalItemId: 'event:evt-dinner',
        eventId: 'evt-dinner',
        timelineType: 'shared_experience',
        confidence: 0.4,
        eventSummary: 'Dinner',
      }],
      legacyOnly: [],
      summary: {
        firstKnownOccurrenceAt: null,
        lastKnownOccurrenceAt: null,
        firstMentionedAt: '2026-08-21T00:00:00.000Z',
        lastMentionedAt: '2026-08-21T00:00:00.000Z',
        firstKnownAppearanceAt: null,
        lastInteractionAt: null,
      },
    });

    const bio = await buildCharacterBiography(USER, MAYA);
    expect(bio?.firstKnownOccurrence).toBeNull();
    expect(bio?.firstSeen).toBeNull();
    expect(bio?.firstMentionedAt).toBe('2026-08-21T00:00:00.000Z');
  });

  it('chat copy labels occurrence separately from first mention', () => {
    const text = formatCharacterMemoryProfileForChat({
      whoAreThey: 'Maya is a friend.',
      relationshipToUser: 'friend',
      majorMemories: ['Dinner'],
      recurringPatterns: [],
      firstKnownOccurrence: '2026-07-12T19:30:00.000Z',
      lastKnownOccurrence: '2026-07-12T19:30:00.000Z',
      firstMentionedAt: '2026-06-01T12:00:00.000Z',
      lastMentionedAt: '2026-08-21T12:00:00.000Z',
      firstSeen: '2026-07-12T19:30:00.000Z',
      lastSeen: '2026-07-12T19:30:00.000Z',
      importanceScore: 80,
      biography: 'Maya and you had dinner in July.',
    }, 'Maya');
    expect(text).toContain('First known occurrence');
    expect(text).toContain('First mentioned in LoreBook');
    expect(text).not.toMatch(/\*\*First seen:\*\*/);
  });
});

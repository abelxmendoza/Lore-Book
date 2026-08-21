import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown; count?: number };
let tableResults: Record<string, TableResult> = {};

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'ilike', 'order', 'limit', 'in', 'maybeSingle']) {
    chain[key] = () => chain;
  }
  (chain as { maybeSingle: () => Promise<TableResult> }).maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (v: TableResult) => void) => resolve(result);
  return chain;
}

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null, count: 0 })),
  },
}));

const getStitchedTimeline = vi.fn();
const getStitchedTimelineForEntity = vi.fn();
vi.mock('../chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimeline: (...args: unknown[]) => getStitchedTimeline(...args),
    getStitchedTimelineForEntity: (...args: unknown[]) => getStitchedTimelineForEntity(...args),
  },
}));

vi.mock('../chat/foundationRecallDataService', () => ({
  resolveCharacterByName: vi.fn(),
}));

import { reconstructEventByQuery } from './eventReconstructionService';
import { resolveCharacterByName } from '../chat/foundationRecallDataService';

const USER = 'user-1';
const MAYA = 'char-maya';

describe('event reconstruction occurrence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      resolved_events: { data: [], error: null },
      characters: { data: [{ name: 'Maya' }], error: null },
      event_meaning_cache: { data: null, error: null },
      event_mentions: { data: [], error: null, count: 0 },
      journal_entries: { data: [], error: null },
      character_timeline_events: {
        data: [{
          event_title: 'Dinner with Maya',
          event_date: '1999-01-01',
          event_summary: 'Legacy dinner',
          resolved_event_id: 'evt-dinner',
        }],
        error: null,
      },
    };
    vi.mocked(resolveCharacterByName).mockResolvedValue({ id: MAYA, name: 'Maya' } as never);
    getStitchedTimeline.mockResolvedValue({ items: [], unresolved_items: [] });
    getStitchedTimelineForEntity.mockResolvedValue({ items: [], unresolved_items: [] });
  });

  it('uses canonical occurredStart, never character_timeline_events.event_date', async () => {
    tableResults.resolved_events = {
      data: [{
        id: 'evt-dinner',
        title: 'Dinner with Maya',
        summary: 'Dinner',
        start_time: '1999-01-01T00:00:00.000Z',
        people: [MAYA],
        significance_score: 40,
      }],
      error: null,
    };
    getStitchedTimeline.mockResolvedValue({
      items: [{
        id: 'event:evt-dinner',
        sourceId: 'evt-dinner',
        title: 'Dinner with Maya',
        occurredAt: '2026-07-12T19:30:00.000Z',
        occurrenceStatus: 'point',
        temporalProjection: { isUnresolved: false, occurredStart: '2026-07-12T19:30:00.000Z' },
      }],
      unresolved_items: [],
    });

    const result = await reconstructEventByQuery(USER, 'Dinner with Maya');
    expect(result?.timeline[0].date).toBe('2026-07-12T19:30:00.000Z');
    expect(result?.timeline[0].canonicalItemId).toBe('event:evt-dinner');
    expect(JSON.stringify(result)).not.toContain('1999');
  });

  it('stays unresolved when canonical occurrence is missing', async () => {
    getStitchedTimelineForEntity.mockResolvedValue({
      items: [],
      unresolved_items: [{
        id: 'event:evt-dinner',
        sourceId: 'evt-dinner',
        title: 'Dinner with Maya',
        body: 'Dinner',
        occurredAt: null,
        occurrenceStatus: 'unresolved',
        temporalProjection: { isUnresolved: true, occurredStart: null },
      }],
    });

    const result = await reconstructEventByQuery(USER, 'Maya');
    expect(result?.timeline[0].date).toBeNull();
    expect(result?.timeline[0].canonicalItemId).toBe('event:evt-dinner');
  });
});

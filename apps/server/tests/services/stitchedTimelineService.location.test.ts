import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stitchedTimelineService } from '../../src/services/chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { chronologyService } from '../../src/services/chronologyV2/chronologyService';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/chronologyV2/chronologyService', () => ({
  chronologyService: { getChronologicalOrder: vi.fn() },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const RESOLVED_EVENTS = [
  {
    id: 'evt-1',
    title: 'Camping trip',
    summary: 'Went camping',
    start_time: '2024-06-01T00:00:00.000Z',
    confidence: 0.9,
    metadata: {},
    people: ['char-jerry'],
    locations: ['loc-hq'],
    activities: [],
    tags: [],
  },
  {
    id: 'evt-2',
    title: 'Work meeting',
    summary: 'Quarterly review',
    start_time: '2024-07-01T00:00:00.000Z',
    confidence: 0.9,
    metadata: {},
    people: ['char-someone-else'],
    locations: ['loc-other'],
    activities: [],
    tags: [],
  },
];

const TIMELINE_EVENTS = [
  { id: 'te-1', title: 'Unrelated calendar event', description: '', event_date: '2024-08-01', occurred_at: null, confidence: 0.9, source_type: 'calendar' },
];

function makeChain(data: unknown, record?: { userIds: string[] }) {
  let empty = false;
  const resultFor = () => {
    const payload = empty ? [] : data;
    const result = Promise.resolve({ data: payload, error: null }) as Promise<{
      data: unknown;
      error: null;
    }> & { limit: () => Promise<{ data: unknown; error: null }> };
    result.limit = () => result;
    return result;
  };
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: string) => {
      if (col === 'user_id') {
        record?.userIds.push(val);
        if (val !== 'user-1') empty = true;
      }
      return chain;
    },
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => resultFor(),
  };
  return chain;
}

describe('stitchedTimelineService — location_id scoping', () => {
  const userIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    userIds.length = 0;
    vi.mocked(chronologyService.getChronologicalOrder).mockImplementation(async (userId: string) => {
      if (userId !== 'user-1') return [] as any;
      return [
        { id: 'moment-1', journal_entry_id: 'je-1', content: 'A private journal note', start_time: '2024-05-01T00:00:00.000Z', source_type: 'manual', tags: [], time_confidence: 0.8 },
      ] as any;
    });
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'timeline_events') return makeChain(TIMELINE_EVENTS, { userIds });
      if (table === 'resolved_events') return makeChain(RESOLVED_EVENTS, { userIds });
      if (table === 'user_chronology_order') return makeChain([], { userIds });
      return makeChain([], { userIds });
    });
  });

  it('with a location filter, only includes resolved_events where that location is in locations[]', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      location_id: 'loc-hq',
    });

    const sourceIds = result.items.map((i) => i.sourceId);
    expect(sourceIds).toEqual(['evt-1']);
    expect(sourceIds).not.toContain('evt-2');
    expect(sourceIds).not.toContain('je-1');
    expect(sourceIds).not.toContain('te-1');
    expect(result.items[0]?.locationIds).toEqual(['loc-hq']);
    expect(result.items[0]?.peopleIds).toEqual(['char-jerry']);
  });

  it('keeps unresolved linkage out of the location subset instead of guessing from journals', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      location_id: 'loc-nobody',
    });
    expect(result.items).toEqual([]);
  });

  it('tenant-isolates location-scoped chronology by user_id', async () => {
    const other = await stitchedTimelineService.getStitchedTimeline('user-2', {
      location_id: 'loc-hq',
    });
    expect(userIds).toContain('user-2');
    expect(other.items).toEqual([]);
  });
});

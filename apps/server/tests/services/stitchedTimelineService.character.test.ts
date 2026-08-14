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
  { id: 'evt-1', title: 'Camping trip', summary: 'Went camping', start_time: '2024-06-01T00:00:00.000Z', confidence: 0.9, metadata: {}, people: ['char-jerry'], locations: [], activities: [], tags: [] },
  { id: 'evt-2', title: 'Work meeting', summary: 'Quarterly review', start_time: '2024-07-01T00:00:00.000Z', confidence: 0.9, metadata: {}, people: ['char-someone-else'], locations: [], activities: [], tags: [] },
];

const TIMELINE_EVENTS = [
  { id: 'te-1', title: 'Unrelated calendar event', description: '', event_date: '2024-08-01', occurred_at: null, confidence: 0.9, source_type: 'calendar' },
];

function makeChain(data: unknown) {
  const result = Promise.resolve({ data, error: null }) as Promise<{
    data: unknown;
    error: null;
  }> & { limit: () => Promise<{ data: unknown; error: null }> };
  result.limit = () => result;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => result,
  };
  return chain;
}

describe('stitchedTimelineService — character_id scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chronologyService.getChronologicalOrder).mockResolvedValue([
      { id: 'moment-1', journal_entry_id: 'je-1', content: 'A private journal note', start_time: '2024-05-01T00:00:00.000Z', source_type: 'manual', tags: [], time_confidence: 0.8 },
    ] as any);
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'timeline_events') return makeChain(TIMELINE_EVENTS);
      if (table === 'resolved_events') return makeChain(RESOLVED_EVENTS);
      if (table === 'user_chronology_order') return makeChain([]);
      return makeChain([]);
    });
  });

  it('without a character filter, includes moments, resolved events, and timeline events', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});

    const sourceIds = result.items.map((i) => i.sourceId);
    expect(sourceIds).toContain('je-1');
    expect(sourceIds).toContain('evt-1');
    expect(sourceIds).toContain('evt-2');
    expect(sourceIds).toContain('te-1');
  });

  it('with a character filter, only includes resolved_events where that character is in people[]', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      character_id: 'char-jerry',
    });

    const sourceIds = result.items.map((i) => i.sourceId);
    expect(sourceIds).toEqual(['evt-1']);
    expect(sourceIds).not.toContain('evt-2');
    expect(sourceIds).not.toContain('je-1');
    expect(sourceIds).not.toContain('te-1');
  });

  it('with a character filter that matches nothing, returns no items rather than falling back to unrelated data', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      character_id: 'char-nobody',
    });

    expect(result.items).toEqual([]);
  });
});

describe('stitchedTimelineService — limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chronologyService.getChronologicalOrder).mockResolvedValue([
      { id: 'moment-1', journal_entry_id: 'je-1', content: 'A private journal note', start_time: '2024-05-01T00:00:00.000Z', source_type: 'manual', tags: [], time_confidence: 0.8 },
    ] as any);
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'timeline_events') return makeChain(TIMELINE_EVENTS);
      if (table === 'resolved_events') return makeChain(RESOLVED_EVENTS);
      if (table === 'user_chronology_order') return makeChain([]);
      return makeChain([]);
    });
  });

  it('omitting limit preserves the full unbounded item set (existing caller behavior unaffected)', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    expect(result.items.length).toBe(4);
  });

  it('caps items after sorting/clustering when limit is passed', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { limit: 2 });
    expect(result.items.length).toBe(2);
  });

  it('a limit larger than the result set is a no-op', async () => {
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { limit: 100 });
    expect(result.items.length).toBe(4);
  });
});

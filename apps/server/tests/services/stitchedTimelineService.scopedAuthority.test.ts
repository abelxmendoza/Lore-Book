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

function makeChain(data: unknown) {
  const result = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> & {
    limit: () => Promise<{ data: unknown; error: null }>;
  };
  result.limit = () => result;
  // Real Supabase query builders are thenable at every step (any chain call
  // can be the terminal one, not just after .order()) — mirror that so a
  // chain ending in .in()/.eq() with no trailing .order() still resolves.
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => result,
    maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

/** A resolved_event with real (non-fallback) canonical occurrence evidence. */
const CONFIDENT_EVENT = {
  id: 'evt-confident',
  title: 'Graduation ceremony',
  summary: 'Walked across the stage.',
  start_time: '2024-06-01T00:00:00.000Z',
  confidence: 0.95,
  metadata: {},
  people: [],
  locations: [],
  activities: [],
  tags: [],
  temporal_precision: 'exact',
  temporal_source: 'user_stated',
  temporal_status: 'anchored',
  temporal_confidence: 0.95,
  temporal_expression: null,
  created_at: '2024-06-01T00:00:00.000Z',
};

describe('stitchedTimelineService — scoped temporal authority (life_arc must not bypass canonical projection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chronologyService.getChronologicalOrder).mockResolvedValue([] as any);
  });

  function mockTables(overrides: Record<string, unknown> = {}) {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'timeline_events') return makeChain(overrides.timeline_events ?? []);
      if (table === 'resolved_events') return makeChain(overrides.resolved_events ?? [CONFIDENT_EVENT]);
      if (table === 'user_chronology_order') return makeChain([]);
      if (table === 'life_arcs') return makeChain(overrides.life_arcs ?? null); // not found -> plain fallthrough
      if (table === 'arc_event_links') return makeChain(overrides.arc_event_links ?? []);
      if (table === 'arc_memberships') return makeChain([]);
      return makeChain([]);
    });
  }

  it('a plain life_arc scope (no matching arc / no cohesion gate) still runs the canonical projector — occurredAt/temporal are populated, not left undefined', async () => {
    mockTables();
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      scope_type: 'life_arc',
      life_arc_id: 'arc-1',
    });

    const item = result.items.find((i) => i.sourceId === 'evt-confident');
    expect(item).toBeTruthy();
    // Before the fix, life_arc paths that fell through the cohesion gate
    // returned raw StitchedTimelineItems with `occurredAt`/`temporal` never
    // set at all (undefined) — the canonical projector never ran.
    expect(item!.occurredAt).toBe('2024-06-01T00:00:00.000Z');
    expect(item!.temporal).toBeTruthy();
    expect(item!.temporal!.occurred.start).toBe('2024-06-01T00:00:00.000Z');
    // life_arc scope now surfaces an unresolved tray too, same as global —
    // previously this field didn't exist at all on non-global returns.
    expect(result.unresolved_items).toBeDefined();
  });

  it('the same canonical event produces the same occurredAt/temporal identity under global scope and life_arc scope', async () => {
    mockTables();
    const global = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    const arc = await stitchedTimelineService.getStitchedTimeline('user-1', {
      scope_type: 'life_arc',
      life_arc_id: 'arc-1',
    });

    const globalItem = global.items.find((i) => i.sourceId === 'evt-confident')!;
    const arcItem = arc.items.find((i) => i.sourceId === 'evt-confident')!;
    expect(globalItem).toBeTruthy();
    expect(arcItem).toBeTruthy();
    expect(arcItem.occurredAt).toBe(globalItem.occurredAt);
    expect(arcItem.timePrecision).toBe(globalItem.timePrecision);
    expect(arcItem.occurrenceStatus).toBe(globalItem.occurrenceStatus);
    expect(arcItem.sourceIds).toEqual(globalItem.sourceIds);
  });

  it('an undated/recording_fallback resolved_event stays unresolved in life_arc scope too — never gets a fabricated occurrence just because scope narrowed', async () => {
    const undatedEvent = {
      ...CONFIDENT_EVENT,
      id: 'evt-undated',
      start_time: null,
      temporal_source: 'recording_fallback',
      temporal_confidence: 0.1,
      metadata: {},
    };
    mockTables({ resolved_events: [undatedEvent] });
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      scope_type: 'life_arc',
      life_arc_id: 'arc-1',
    });

    expect(result.items.find((i) => i.sourceId === 'evt-undated')).toBeUndefined();
    const unresolvedItem = (result.unresolved_items ?? []).find((i) => i.sourceId === 'evt-undated');
    expect(unresolvedItem).toBeTruthy();
    expect(unresolvedItem!.occurredAt).toBeNull();
  });

  it('occasion-arc link.sort_time is used only as pre-projection ordering, never as the returned occurredAt — a confident event keeps its own real occurrence', async () => {
    mockTables({
      life_arcs: { title: 'Graduation weekend', start_date: null, end_date: null, arc_type: 'occasion', metadata: {}, summary: null, tags: [], confidence: 0.8 },
      arc_event_links: [
        { resolved_event_id: 'evt-confident', journal_entry_id: null, user_presence: 'attended', temporal_role: 'during', sort_time: '1999-01-01T00:00:00.000Z' },
      ],
      resolved_events: [CONFIDENT_EVENT],
    });

    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      scope_type: 'life_arc',
      life_arc_id: 'arc-1',
    });

    const item = result.items.find((i) => i.sourceId === 'evt-confident');
    expect(item).toBeTruthy();
    // The link's sort_time (1999) must NOT leak through as occurredAt — the
    // event's own real start_time (2024) is the only valid occurrence claim.
    expect(item!.occurredAt).toBe('2024-06-01T00:00:00.000Z');
    expect(item!.occurredAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('occasion-arc journal moment with low time_confidence (write-time fallback) is not surfaced as a dated occurrence', async () => {
    mockTables({
      life_arcs: { title: 'Vague weekend', start_date: null, end_date: null, arc_type: 'occasion', metadata: {}, summary: null, tags: [], confidence: 0.8 },
      arc_event_links: [
        { resolved_event_id: null, journal_entry_id: 'je-uncertain', user_presence: 'attended', temporal_role: 'during', sort_time: '2024-06-01T00:00:00.000Z' },
      ],
      resolved_events: [],
    });
    const baseFrom = vi.mocked(supabaseAdmin.from);
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'journal_entries')
        return makeChain([
          { id: 'je-uncertain', content: 'Something happened, not sure when I wrote this down.', date: '2024-06-01T00:00:00.000Z', source: 'manual', tags: [], time_confidence: 0.1, time_precision: 'approximate', created_at: '2024-06-01T00:00:00.000Z' },
        ]);
      return baseFrom(table);
    });

    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      scope_type: 'life_arc',
      life_arc_id: 'arc-1',
    });

    const dated = result.items.find((i) => i.sourceId === 'je-uncertain');
    const unresolved = (result.unresolved_items ?? []).find((i) => i.sourceId === 'je-uncertain');
    // Low-confidence journal date must not appear as a confident dated item.
    expect(dated).toBeUndefined();
    expect(unresolved).toBeTruthy();
  });
});

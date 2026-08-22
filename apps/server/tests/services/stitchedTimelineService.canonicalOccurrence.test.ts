import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stitchedTimelineService } from '../../src/services/chronologyV2/stitchedTimelineService';
import { projectCharacterTimelineFromSources } from '../../src/services/characters/characterEntityTimelineService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { chronologyService } from '../../src/services/chronologyV2/chronologyService';
import { logger } from '../../src/logger';

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
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => result,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return chain;
}

/**
 * Real production shape: temporal_source at its schema default
 * ('recording_fallback') and temporal_confidence null, exactly matching
 * rows where the ingestion path set start_time but never separately
 * classified the evidence. This is the dominant shape in production
 * (confirmed live: 32 of ~48 resolved_events rows).
 */
function prodShapedEvent(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'evt-default',
    title: 'Event',
    summary: '',
    start_time: '2024-01-01T00:00:00.000Z',
    confidence: 0.6, // resolved_events.confidence schema default
    metadata: {},
    people: ['char-maya'],
    locations: [],
    activities: [],
    tags: [],
    temporal_precision: 'unknown', // schema default
    temporal_source: 'recording_fallback', // schema default — the crux of the bug
    temporal_status: 'unanchored', // schema default
    temporal_confidence: null, // nullable, no default — commonly absent
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stitchedTimelineService — canonical occurrence on the real production resolved_events shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chronologyService.getChronologicalOrder).mockResolvedValue([] as any);
  });

  function mockTables(resolvedEvents: unknown[]) {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'timeline_events') return makeChain([]);
      if (table === 'resolved_events') return makeChain(resolvedEvents);
      if (table === 'user_chronology_order') return makeChain([]);
      return makeChain([]);
    });
  }

  it('the synthetic Maya fixture: dated events resolve to known occurrence, the unresolved one stays unresolved', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-met-maya',
        title: 'Met Maya Chen at Northwind Labs',
        summary: 'Met Maya Chen at Northwind Labs',
        start_time: '2024-03-15T00:00:00.000Z',
      }),
      prodShapedEvent({
        id: 'evt-picnic',
        title: 'Picnic with Maya',
        summary: 'July picnic',
        start_time: '2024-07-15T00:00:00.000Z',
        temporal_precision: 'month',
      }),
      prodShapedEvent({
        id: 'evt-memovault',
        title: 'MemoVault launch',
        summary: 'MemoVault launch with Maya',
        start_time: '2025-08-01T00:00:00.000Z',
      }),
      prodShapedEvent({
        id: 'evt-unresolved',
        title: 'Something about Maya, no date',
        summary: 'genuinely unresolved',
        start_time: null,
      }),
    ]);

    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {
      character_id: 'char-maya',
    });

    const met = result.items.find((i) => i.sourceId === 'evt-met-maya');
    const picnic = result.items.find((i) => i.sourceId === 'evt-picnic');
    const launch = result.items.find((i) => i.sourceId === 'evt-memovault');
    const unresolved = (result.unresolved_items ?? []).find((i) => i.sourceId === 'evt-unresolved');

    // The exact bug this task closes: a real start_time must not appear as
    // "Date unknown" merely because temporal_source sits at its schema default.
    expect(met).toBeTruthy();
    expect(met?.occurredAt).toBe('2024-03-15T00:00:00.000Z');
    expect(met?.occurrenceStatus).not.toBe('unresolved');

    expect(picnic).toBeTruthy();
    expect(picnic?.occurredAt).toContain('2024-07');

    expect(launch).toBeTruthy();
    expect(launch?.occurredAt).toBe('2025-08-01T00:00:00.000Z');
    expect(launch?.occurrenceStatus).not.toBe('unresolved');

    // The genuinely undated row must NOT be rescued into a fake date.
    expect(result.items.find((i) => i.sourceId === 'evt-unresolved')).toBeUndefined();
    expect(unresolved).toBeTruthy();
    expect(unresolved?.occurredAt).toBeNull();

    // First/last known occurrence, matching Phase 5's expected synthetic result.
    const knownDates = result.items
      .map((i) => i.occurredAt)
      .filter((d): d is string => Boolean(d))
      .sort();
    expect(knownDates[0]).toBe('2024-03-15T00:00:00.000Z');
    expect(knownDates[knownDates.length - 1]).toBe('2025-08-01T00:00:00.000Z');
  });

  it('a genuine user_stated/context_inferred source is never downgraded — only the bare recording_fallback default is upgraded', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-user-stated',
        title: 'User-confirmed event',
        temporal_source: 'user_stated',
        temporal_precision: 'exact',
        temporal_confidence: 0.95,
      }),
    ]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    const item = result.items.find((i) => i.sourceId === 'evt-user-stated');
    expect(item?.temporalSource).toBe('user_stated');
    expect(item?.timePrecision).toBe('exact');
  });

  it('a genuinely recording_fallback-sourced event with NO start_time stays unresolved, not rescued', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-truly-unknown',
        title: 'No real date at all',
        start_time: null,
      }),
    ]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    expect(result.items.find((i) => i.sourceId === 'evt-truly-unknown')).toBeUndefined();
    const unresolved = (result.unresolved_items ?? []).find((i) => i.sourceId === 'evt-truly-unknown');
    expect(unresolved).toBeTruthy();
    expect(unresolved?.occurredAt).toBeNull();
  });

  it('no character_timeline_events query is ever issued', async () => {
    mockTables([prodShapedEvent({ id: 'evt-1' })]);
    await stitchedTimelineService.getStitchedTimeline('user-1', {});
    const calledTables = vi.mocked(supabaseAdmin.from).mock.calls.map((c) => c[0]);
    expect(calledTables).not.toContain('character_timeline_events');
  });

  it('a real query error is surfaced as data_errors, not silently returned as an empty/unresolved timeline', async () => {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'resolved_events') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          or: () => chain,
          order: () =>
            Promise.resolve({
              data: null,
              error: { message: "Could not find the table 'public.resolved_events' in the schema cache" },
            }),
        };
        return chain;
      }
      return makeChain([]);
    });
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    expect(result.items).toEqual([]);
    // The distinguishing signal: this empty result came from a real failure,
    // not from the user genuinely having zero events.
    expect(result.data_errors).toBeTruthy();
    expect(result.data_errors?.some((e) => e.source === 'resolved_events')).toBe(true);
  });

  it('no query error means no data_errors field at all', async () => {
    mockTables([prodShapedEvent({ id: 'evt-1' })]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', {});
    expect(result.data_errors).toBeUndefined();
  });

  it('tenant isolation: only the queried user_id scope is used (mock captures no cross-tenant leak by construction)', async () => {
    let capturedEq: Array<[string, unknown]> = [];
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'resolved_events') {
        const chain: any = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            capturedEq.push([col, val]);
            return chain;
          },
          gte: () => chain,
          lte: () => chain,
          or: () => chain,
          order: () => Promise.resolve({ data: [prodShapedEvent({ id: 'evt-1' })], error: null }),
        };
        return chain;
      }
      return makeChain([]);
    });
    await stitchedTimelineService.getStitchedTimeline('user-tenant-a', {});
    expect(capturedEq.some(([col, val]) => col === 'user_id' && val === 'user-tenant-a')).toBe(true);
  });

  it('start_time-only row with no optional temporal columns is still a known occurrence', async () => {
    mockTables([{
      id: 'evt-core-only',
      title: 'Met Maya Chen at Northwind Labs',
      summary: 'Met Maya Chen at Northwind Labs',
      start_time: '2024-03-15T00:00:00.000Z',
      end_time: null,
      confidence: 0.6,
      metadata: {},
      people: ['char-maya'],
      locations: [],
      activities: [],
      created_at: '2026-08-21T12:00:00.000Z',
    }]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    const met = result.items.find((i) => i.sourceId === 'evt-core-only');
    expect(met?.occurredAt).toBe('2024-03-15T00:00:00.000Z');
    expect(met?.occurrenceStatus).not.toBe('unresolved');
    expect(met?.occurredAt).not.toBe('2026-08-21T12:00:00.000Z');
  });

  it('created_at cannot rescue a null start_time', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-no-date',
        title: 'Heard something about Maya Chen',
        start_time: null,
        created_at: '2026-08-21T12:00:00.000Z',
      }),
    ]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    expect(result.items.find((i) => i.sourceId === 'evt-no-date')).toBeUndefined();
    const unresolved = (result.unresolved_items ?? []).find((i) => i.sourceId === 'evt-no-date');
    expect(unresolved?.occurredAt).toBeNull();
    expect(unresolved?.recordedAt).toBe('2026-08-21T12:00:00.000Z');
  });

  it('sortTime / epoch sentinel cannot rescue a null start_time', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-sort-sentinel',
        title: 'Undated Maya mention',
        start_time: null,
        created_at: '2026-08-21T12:00:00.000Z',
      }),
    ]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    const unresolved = (result.unresolved_items ?? []).find((i) => i.sourceId === 'evt-sort-sentinel');
    expect(unresolved?.occurredAt).toBeNull();
    expect(unresolved?.sortTime).toBe('1970-01-01T00:00:00.000Z');
    expect(unresolved?.occurrenceStatus).toBe('unresolved');
  });

  it('optional-column schema drift retries the core select and still projects start_time', async () => {
    const maya = prodShapedEvent({
      id: 'evt-met-maya',
      title: 'Met Maya Chen at Northwind Labs',
      start_time: '2024-03-15T00:00:00.000Z',
    });
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table !== 'resolved_events') return makeChain([]);
      const chain: any = {
        _select: '',
        select: (cols: string) => {
          chain._select = cols;
          return chain;
        },
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        or: () => chain,
        in: () => chain,
        order: () => {
          if (/temporal_source|tags/.test(chain._select)) {
            return Promise.resolve({
              data: null,
              error: {
                code: 'PGRST204',
                message: "Could not find the 'temporal_source' column of 'resolved_events' in the schema cache",
              },
            });
          }
          return Promise.resolve({ data: [maya], error: null });
        },
      };
      return chain;
    });

    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    expect(result.data_errors).toBeUndefined();
    const met = result.items.find((i) => i.sourceId === 'evt-met-maya');
    expect(met?.occurredAt).toBe('2024-03-15T00:00:00.000Z');
    expect(met?.occurrenceStatus).not.toBe('unresolved');
    expect(logger.error).toHaveBeenCalled();
  });

  it('empty character match returns no items and no fabricated unresolved rows', async () => {
    mockTables([
      prodShapedEvent({
        id: 'evt-other',
        title: 'Met Jamie at Northwind Labs',
        people: ['char-jamie'],
        start_time: '2024-03-15T00:00:00.000Z',
      }),
    ]);
    const result = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    expect(result.items).toHaveLength(0);
    expect(result.unresolved_items ?? []).toHaveLength(0);
  });

  it('Character Timeline first/last and Biography consume the same canonical occurrence as WMA start_time', async () => {
    const rows = [
      prodShapedEvent({
        id: 'evt-met-maya',
        title: 'Met Maya Chen at Northwind Labs',
        summary: 'Met Maya Chen at Northwind Labs',
        start_time: '2024-03-15T00:00:00.000Z',
      }),
      prodShapedEvent({
        id: 'evt-picnic',
        title: 'Picnic with Maya',
        summary: 'July picnic',
        start_time: '2024-07-15T00:00:00.000Z',
        temporal_precision: 'month',
      }),
      prodShapedEvent({
        id: 'evt-memovault',
        title: 'MemoVault launch',
        summary: 'MemoVault launch with Maya',
        start_time: '2025-08-01T00:00:00.000Z',
      }),
      prodShapedEvent({
        id: 'evt-unresolved',
        title: 'Something about Maya, no date',
        start_time: null,
        created_at: '2026-08-21T12:00:00.000Z',
      }),
    ];
    mockTables(rows);

    const stitched = await stitchedTimelineService.getStitchedTimeline('user-1', { character_id: 'char-maya' });
    const timeline = projectCharacterTimelineFromSources({
      entityId: 'char-maya',
      timezone: 'America/Los_Angeles',
      stitchedItems: stitched.items,
      unresolvedItems: stitched.unresolved_items,
    });

    expect(timeline.unresolved.some((row) => row.eventId === 'evt-met-maya')).toBe(false);
    expect(timeline.unresolved.some((row) => row.eventId === 'evt-picnic')).toBe(false);
    expect(timeline.unresolved.some((row) => row.eventId === 'evt-memovault')).toBe(false);
    expect(timeline.unresolved.some((row) => row.eventId === 'evt-unresolved')).toBe(true);

    expect(timeline.summary.firstKnownOccurrenceAt).toBe('2024-03-15T00:00:00.000Z');
    expect(timeline.summary.lastKnownOccurrenceAt).toBe('2025-08-01T00:00:00.000Z');

    const wmaDates = Object.fromEntries(
      rows.filter((row) => row.start_time).map((row) => [row.id as string, row.start_time as string]),
    );
    for (const [id, startTime] of Object.entries(wmaDates)) {
      const stitchedItem = stitched.items.find((item) => item.sourceId === id);
      const timelineRow = [...timeline.sharedExperiences, ...timeline.lore].find((row) => row.eventId === id);
      expect(stitchedItem?.occurredAt).toBe(startTime);
      expect(timelineRow?.occurredStart).toBe(startTime);
    }

    expect(timeline.summary.firstKnownOccurrenceAt).toBe(wmaDates['evt-met-maya']);
    expect(timeline.summary.lastKnownOccurrenceAt).toBe(wmaDates['evt-memovault']);
  });
});

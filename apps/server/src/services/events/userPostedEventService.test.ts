import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const insertSingle = vi.fn();
const updateEq = vi.fn();
const selectMaybe = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'resolved_events') throw new Error(`unexpected table ${table}`);
      return {
        insert: (payload: unknown) => ({
          select: () => ({
            single: async () => insertSingle(payload),
          }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => selectMaybe(),
            }),
          }),
        }),
        update: (payload: unknown) => ({
          eq: () => ({
            eq: async () => updateEq(payload),
          }),
        }),
      };
    }),
  },
}));

import {
  createUserPostedEvent,
  addStoryToUserPostedEvent,
  addVenueStopToUserPostedEvent,
} from './userPostedEventService';

describe('userPostedEventService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user_posted event with primary place and optional story', async () => {
    insertSingle.mockResolvedValue({
      data: {
        id: 'evt-1',
        title: 'Backyard Flyer Show',
        summary: 'Backyard Flyer Show',
        type: 'attended_event',
        start_time: '2026-06-15T00:00:00.000Z',
        locations: ['loc-1'],
        people: [],
        activities: [],
        confidence: 1,
        metadata: { created_via: 'user_posted' },
        created_at: '2026-06-15T00:00:00.000Z',
        updated_at: '2026-06-15T00:00:00.000Z',
      },
      error: null,
    });

    const row = await createUserPostedEvent('user-1', {
      title: 'Backyard Flyer Show',
      start_time: '2026-06-15',
      location_id: 'loc-1',
      location_name: 'Northwind House',
      story: 'Marcus opened the set.',
      organization_id: 'org-1',
      organization_name: 'Northwind Crew',
    });

    expect(row.id).toBe('evt-1');
    expect(insertSingle).toHaveBeenCalled();
    const payload = insertSingle.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.type).toBe('attended_event');
    expect(payload.metadata).toMatchObject({
      created_via: 'user_posted',
      primary_place: { id: 'loc-1', name: 'Northwind House' },
      organization_ids: ['org-1'],
    });
    const meta = payload.metadata as { stories: Array<{ body: string }>; venue_stops: unknown[] };
    expect(meta.stories[0].body).toBe('Marcus opened the set.');
    expect(meta.venue_stops).toHaveLength(1);
  });

  it('adds a story onto an existing event', async () => {
    selectMaybe.mockResolvedValue({
      data: { id: 'evt-1', metadata: { created_via: 'user_posted', stories: [] } },
      error: null,
    });
    updateEq.mockResolvedValue({ error: null });

    const story = await addStoryToUserPostedEvent('user-1', 'evt-1', 'We walked to Ritual Coffee after.');
    expect(story.body).toContain('Ritual Coffee');
    expect(updateEq).toHaveBeenCalled();
    const updated = updateEq.mock.calls[0][0] as { metadata: { stories: Array<{ body: string }> } };
    expect(updated.metadata.stories).toHaveLength(1);
  });

  it('appends an afterparty venue stop', async () => {
    selectMaybe.mockResolvedValue({
      data: {
        id: 'evt-1',
        locations: ['loc-1'],
        metadata: {
          created_via: 'user_posted',
          venue_stops: [{ location_id: 'loc-1', location_name: 'Amp', order: 0, role: 'primary' }],
        },
      },
      error: null,
    });
    updateEq.mockResolvedValue({ error: null });

    const stops = await addVenueStopToUserPostedEvent('user-1', 'evt-1', {
      location_id: 'loc-2',
      location_name: 'Ritual Coffee',
      role: 'afterparty',
    });
    expect(stops).toHaveLength(2);
    expect(stops[1].role).toBe('afterparty');
  });
});

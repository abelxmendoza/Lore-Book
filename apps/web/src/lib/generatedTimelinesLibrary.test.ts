import { describe, it, expect } from 'vitest';
import {
  findTimelineByQuery,
  normalizeTimelineQueryKey,
  removeGeneratedTimeline,
  upsertGeneratedTimeline,
} from './generatedTimelinesLibrary';

describe('generatedTimelinesLibrary', () => {
  it('normalizes query keys for lookup', () => {
    expect(normalizeTimelineQueryKey('  My Nightlife  ')).toBe('my nightlife');
    expect(findTimelineByQuery([], 'my nightlife')).toBeUndefined();
  });

  it('upserts and finds by query', () => {
    const { library, saved } = upsertGeneratedTimeline([], {
      query: '2024 career',
      isMock: true,
      events: [
        { id: '1', start_time: '2024-01-01', content: 'Started new role' },
      ],
    });

    expect(library).toHaveLength(1);
    expect(saved.query).toBe('2024 career');
    expect(findTimelineByQuery(library, '2024 career')?.id).toBe(saved.id);

    const again = upsertGeneratedTimeline(library, {
      query: '2024 career',
      isMock: false,
      events: [
        { id: '2', start_time: '2024-06-01', content: 'Promotion' },
      ],
      existingId: saved.id,
    });
    expect(again.library).toHaveLength(1);
    expect(again.saved.events).toHaveLength(1);
    expect(again.saved.isMock).toBe(false);
  });

  it('removes timelines by id', () => {
    const { library, saved } = upsertGeneratedTimeline([], {
      query: 'family',
      isMock: true,
      events: [{ id: 'a', start_time: '2020-01-01', content: 'Trip' }],
    });
    expect(removeGeneratedTimeline(library, saved.id)).toHaveLength(0);
  });
});

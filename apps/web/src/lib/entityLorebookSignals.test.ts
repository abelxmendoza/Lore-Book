import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEntityLorebookSignalsCache,
  fetchEntityLorebookSignals,
  filterEventsForSubject,
  matchesSubject,
  summarizeEntityMoments,
} from './entityLorebookSignals';

const fetchJsonMock = vi.fn();

vi.mock('./api', () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

describe('entityLorebookSignals', () => {
  beforeEach(() => {
    clearEntityLorebookSignalsCache();
    fetchJsonMock.mockReset();
  });

  it('summarizes moments into event/day/word counts', () => {
    expect(
      summarizeEntityMoments([
        {
          id: '1',
          date: '2026-01-01T12:00:00Z',
          title: 'First Amazon trip',
          summary: 'Picked up a package and met Jamie.',
        },
        {
          id: '2',
          date: '2026-01-02T09:00:00Z',
          title: 'Return to Amazon',
          summary: 'Returned a headset after work.',
        },
      ]),
    ).toEqual({
      eventCount: 2,
      uniqueDays: 2,
      wordCount: 18,
    });
  });

  it('filters location events by locations list or text', () => {
    const events = [
      {
        id: 'a',
        title: 'Coffee run',
        summary: 'Morning espresso',
        start_time: '2026-03-01T10:00:00Z',
        locations: ['Northwind Depot'],
      },
      {
        id: 'b',
        title: 'Locker pickup at Amazon',
        summary: 'Grabbed a box',
        start_time: '2026-03-02T10:00:00Z',
        locations: [],
      },
      {
        id: 'c',
        title: 'Unrelated',
        summary: 'No match',
        start_time: '2026-03-03T10:00:00Z',
        locations: ['Vanguard Robotics'],
      },
    ];

    const matched = filterEventsForSubject(events, 'Amazon', 'location');
    expect(matched.map((m) => m.id)).toEqual(['b']);
  });

  it('rejects tiny subject needles', () => {
    expect(matchesSubject('I am here', 'a')).toBe(false);
    expect(matchesSubject('Amazon locker', 'Amazon')).toBe(true);
  });

  it('fetches character timeline signals', async () => {
    fetchJsonMock.mockResolvedValueOnce({
      success: true,
      timelines: {
        sharedExperiences: [
          {
            id: '1',
            eventTitle: 'Dinner with Marcus',
            eventDate: '2026-02-01',
            eventSummary: 'Talked about MemoVault.',
          },
        ],
        lore: [
          {
            id: '2',
            eventTitle: 'Marcus moved',
            eventDate: '2026-02-10',
            eventSummary: 'He relocated across town.',
          },
        ],
      },
    });

    const signals = await fetchEntityLorebookSignals({
      subjectLabel: 'Marcus',
      focus: { characterId: '00000000-0000-4000-8000-000000000001' },
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/conversation/characters/00000000-0000-4000-8000-000000000001/timelines',
    );
    expect(signals.eventCount).toBe(2);
    expect(signals.uniqueDays).toBe(2);
    expect((signals.wordCount ?? 0) > 0).toBe(true);
  });

  it('counts location entries and matching events', async () => {
    fetchJsonMock
      .mockResolvedValueOnce({
        location: {
          entries: [
            { id: 'e1', date: '2026-04-01', summary: 'First visit to Amazon locker.' },
          ],
        },
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: 'ev1',
            title: 'Amazon pickup',
            summary: 'Collected a package after work.',
            start_time: '2026-04-02T18:00:00Z',
            locations: ['Amazon'],
          },
          {
            id: 'ev2',
            title: 'Gym',
            summary: 'Leg day',
            start_time: '2026-04-03T18:00:00Z',
            locations: ['Northwind Gym'],
          },
        ],
      });

    const signals = await fetchEntityLorebookSignals({
      subjectLabel: 'Amazon',
      focus: { locationId: '00000000-0000-4000-8000-000000000099' },
    });

    expect(signals.eventCount).toBe(2);
    expect(signals.uniqueDays).toBe(2);
  });
});

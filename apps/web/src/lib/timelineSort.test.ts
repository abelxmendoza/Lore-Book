import { describe, it, expect } from 'vitest';
import { sortTimelineEventsChronologically } from './timelineSort';

describe('sortTimelineEventsChronologically', () => {
  it('sorts ascending (oldest first) by default', () => {
    const events = [
      { id: 'b', eventDate: '2024-06-01T00:00:00.000Z' },
      { id: 'a', eventDate: '2022-01-01T00:00:00.000Z' },
      { id: 'c', eventDate: '2025-01-01T00:00:00.000Z' },
    ];
    const sorted = sortTimelineEventsChronologically(events);
    expect(sorted.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending when requested', () => {
    const events = [
      { id: 'b', eventDate: '2024-06-01T00:00:00.000Z' },
      { id: 'a', eventDate: '2022-01-01T00:00:00.000Z' },
    ];
    const sorted = sortTimelineEventsChronologically(events, 'desc');
    expect(sorted.map(e => e.id)).toEqual(['b', 'a']);
  });

  it('pushes invalid dates to the end', () => {
    const events = [
      { id: 'bad', eventDate: 'not-a-date' },
      { id: 'good', eventDate: '2023-01-01T00:00:00.000Z' },
    ];
    const sorted = sortTimelineEventsChronologically(events);
    expect(sorted.map(e => e.id)).toEqual(['good', 'bad']);
  });
});

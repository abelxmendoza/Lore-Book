import { describe, expect, it } from 'vitest';

import {
  resolveEventRelativeAnchor,
  hasEventRelativeCue,
  type DatedEvent,
} from './eventRelativeResolver';

const EVENTS: DatedEvent[] = [
  { id: 'move', title: 'The move to Los Angeles', start_time: '2018-06-01T00:00:00Z' },
  { id: 'wedding', title: 'Wedding', summary: 'married Sarah', start_time: '2021-09-15T00:00:00Z' },
  { id: 'graduation', title: 'College graduation', start_time: '2016-05-20T00:00:00Z' },
];

describe('resolveEventRelativeAnchor', () => {
  it('bounds "before the move" to before the event start', () => {
    const a = resolveEventRelativeAnchor('I quit my job before the move', EVENTS)!;
    expect(a.relation).toBe('before');
    expect(a.matchedEventId).toBe('move');
    expect(a.occurredBefore).toBe('2018-06-01T00:00:00Z');
    expect(a.occurredAfter).toBeUndefined();
  });

  it('bounds "after the wedding" to after the event', () => {
    const a = resolveEventRelativeAnchor('we bought a house after the wedding', EVENTS)!;
    expect(a.relation).toBe('after');
    expect(a.matchedEventId).toBe('wedding');
    expect(a.occurredAfter).toBe('2021-09-15T00:00:00Z');
  });

  it('matches via summary tokens when title is sparse', () => {
    const a = resolveEventRelativeAnchor('I felt different after marrying Sarah', EVENTS);
    // "marrying" won't token-match "married"; ensure we do not false-match.
    // But "after Sarah" → summary has "sarah" (1 hit) → below threshold → null.
    expect(a).toBeNull();
  });

  it('handles "the summer before graduation"', () => {
    const a = resolveEventRelativeAnchor('I interned the summer before graduation', EVENTS)!;
    expect(a.relation).toBe('before');
    expect(a.matchedEventId).toBe('graduation');
    expect(a.occurredBefore).toBe('2016-05-20T00:00:00Z');
  });

  it('returns null when no event matches the phrase', () => {
    expect(resolveEventRelativeAnchor('before the concert', EVENTS)).toBeNull();
  });

  it('returns null when there is no relative phrase', () => {
    expect(resolveEventRelativeAnchor('I had coffee with Maria', EVENTS)).toBeNull();
  });

  it('returns null with no events', () => {
    expect(resolveEventRelativeAnchor('before the move', [])).toBeNull();
  });

  it('"around the wedding" bounds both sides', () => {
    const a = resolveEventRelativeAnchor('things were tense around the wedding', EVENTS)!;
    expect(a.relation).toBe('around');
    expect(a.occurredAfter).toBe('2021-09-15T00:00:00Z');
    expect(a.occurredBefore).toBe('2021-09-15T00:00:00Z');
  });
});

describe('hasEventRelativeCue', () => {
  it.each(['before the move', 'right after the wedding', 'the summer before graduation', 'during the trip'])(
    'detects "%s"',
    (t) => expect(hasEventRelativeCue(t)).toBe(true),
  );
  it.each(['had coffee with Maria', 'I moved to LA'])('skips "%s"', (t) =>
    expect(hasEventRelativeCue(t)).toBe(false),
  );
});

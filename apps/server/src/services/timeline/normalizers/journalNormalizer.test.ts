import { describe, expect, it } from 'vitest';

import { normalizeJournalEntry } from './journalNormalizer';

describe('journalNormalizer occurrence authority', () => {
  it('20. does not promote created_at / missing date onto the timeline', () => {
    expect(normalizeJournalEntry({
      id: 'je-1',
      date: null,
      content: 'I wrote this today. I do not remember when it happened.',
      metadata: {},
    })).toEqual([]);
  });

  it('does not emit recording_fallback dates as occurrence', () => {
    expect(normalizeJournalEntry({
      id: 'je-2',
      date: '2026-08-20T18:42:13.001Z',
      content: 'Chat capture with no event date',
      metadata: { temporal_source: 'recording_fallback' },
    })).toEqual([]);
  });

  it('keeps an explicit occurrence', () => {
    const events = normalizeJournalEntry({
      id: 'je-3',
      date: '2026-07-15T20:00:00.000Z',
      content: 'Concert with Jamie',
      metadata: { temporal_source: 'user_stated' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventDate.toISOString()).toBe('2026-07-15T20:00:00.000Z');
  });
});

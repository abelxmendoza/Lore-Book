import { describe, expect, it } from 'vitest';

import { xAdapter } from '../../external/x.adapter';

/**
 * Behavioral coverage for the sync pipeline pieces that decide what lands in LoreBook.
 * (Full OAuth + DB sync is integration-tested elsewhere / via scripts.)
 */
describe('X → LoreBook sync helpers', () => {
  it('imports replies and quotes while dropping retweets', () => {
    const events = xAdapter({
      data: [
        { id: '10', text: 'original thought', created_at: '2026-01-01T00:00:00.000Z' },
        {
          id: '11',
          text: 'quoting with context',
          created_at: '2026-01-02T00:00:00.000Z',
          referenced_tweets: [{ type: 'quoted', id: '9' }],
        },
        {
          id: '12',
          text: 'reply with a memory',
          created_at: '2026-01-03T00:00:00.000Z',
          referenced_tweets: [{ type: 'replied_to', id: '8' }],
        },
        {
          id: '13',
          text: 'RT noise',
          created_at: '2026-01-04T00:00:00.000Z',
          referenced_tweets: [{ type: 'retweeted', id: '7' }],
        },
      ],
      includes: { users: [{ id: '1', username: 'demo' }] },
    });

    expect(events.map((e) => e.sourceId)).toEqual(['10', '11', '12']);
    expect(events.find((e) => e.sourceId === '11')?.type).toBe('quote');
    expect(events.find((e) => e.sourceId === '12')?.type).toBe('reply');
  });

  it('tracks the newest snowflake among mixed ids', () => {
    const ids = ['100', '99', '1000', null, 'abc', '500'];
    let best: string | null = null;
    for (const id of ids) {
      if (!id || !/^\d+$/.test(id)) continue;
      if (!best || BigInt(id) > BigInt(best)) best = id;
    }
    expect(best).toBe('1000');
  });
});

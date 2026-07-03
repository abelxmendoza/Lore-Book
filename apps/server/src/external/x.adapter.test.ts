import { describe, expect, it } from 'vitest';

import { xAdapter } from './x.adapter';

describe('xAdapter', () => {
  it('normalizes X API v2 user post payloads into provenance-rich lore events', () => {
    const events = xAdapter({
      data: [
        {
          id: '1840000000000000001',
          author_id: '42',
          created_at: '2025-05-01T12:30:00.000Z',
          text: 'shipped the Lorebook importer today   #build https://t.co/a',
          lang: 'en',
          public_metrics: { like_count: 12 },
          attachments: { media_keys: ['3_1'] },
          entities: {
            hashtags: [{ tag: 'build' }],
            urls: [{ url: 'https://t.co/a', expanded_url: 'https://example.com/lorebook' }],
          },
        },
      ],
      includes: {
        users: [{ id: '42', username: 'lorekeeper' }],
        media: [{ media_key: '3_1', type: 'photo', url: 'https://pbs.twimg.com/media/example.jpg' }],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'x',
      sourceId: '1840000000000000001',
      timestamp: '2025-05-01T12:30:00.000Z',
      type: 'post',
      text: 'shipped the Lorebook importer today #build https://t.co/a',
      imageUrl: 'https://pbs.twimg.com/media/example.jpg',
      url: 'https://x.com/lorekeeper/status/1840000000000000001',
      tags: ['build', 'media'],
      metadata: {
        author_id: '42',
        lang: 'en',
        public_metrics: { like_count: 12 },
        expanded_urls: ['https://example.com/lorebook'],
      },
    });
  });

  it('keeps original quote posts but skips retweets and replies', () => {
    const events = xAdapter({
      data: [
        {
          id: '1',
          created_at: '2025-01-01T00:00:00.000Z',
          text: 'my own take on this launch',
          referenced_tweets: [{ type: 'quoted', id: '99' }],
        },
        {
          id: '2',
          created_at: '2025-01-02T00:00:00.000Z',
          text: 'RT @somebody: not mine',
          referenced_tweets: [{ type: 'retweeted', id: '98' }],
        },
        {
          id: '3',
          created_at: '2025-01-03T00:00:00.000Z',
          text: '@friend yep',
          referenced_tweets: [{ type: 'replied_to', id: '97' }],
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0].sourceId).toBe('1');
    expect(events[0].metadata?.quoted_post_id).toBe('99');
  });

  it('still supports the legacy mocked posts payload shape', () => {
    const events = xAdapter({
      posts: [
        {
          id: 'legacy-1',
          created_at: '2024-01-01T00:00:00.000Z',
          text: 'released an old import path',
          media_urls: ['https://example.com/photo.jpg'],
        },
      ],
    });

    expect(events[0]).toMatchObject({
      sourceId: 'legacy-1',
      text: 'released an old import path',
      imageUrl: 'https://example.com/photo.jpg',
      tags: ['media'],
    });
  });
});

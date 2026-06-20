import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollLoreBookNotice, dispatchLoreBookNotice, subscribeLoreBookNotice } from './loreBookNoticeClient';
import type { LoreBookNoticeEvent } from './loreBookNoticeTypes';

describe('loreBookNoticeClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('pollLoreBookNotice dispatches on 200 with items', async () => {
    const notice: LoreBookNoticeEvent = {
      chatMessageId: 'msg-1',
      userId: 'user-1',
      timestamp: new Date().toISOString(),
      items: [{ domain: 'quests', name: 'Ship beta', confidence: 0.9 }],
    };

    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: async () => notice,
    } as Response);

    const received: LoreBookNoticeEvent[] = [];
    const unsub = subscribeLoreBookNotice((n) => received.push(n));

    await pollLoreBookNotice('msg-1', 'token', dispatchLoreBookNotice);

    expect(received).toHaveLength(1);
    expect(received[0].items[0].name).toBe('Ship beta');
    unsub();
  });

  it('pollLoreBookNotice silently stops on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await expect(
      pollLoreBookNotice('msg-1', 'token', () => {
        throw new Error('should not call');
      })
    ).resolves.toBeUndefined();
  });

  it('pollLoreBookNotice ignores empty item lists', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: async () => ({
        chatMessageId: 'msg-1',
        userId: 'user-1',
        timestamp: new Date().toISOString(),
        items: [],
      }),
    } as Response);

    const spy = vi.fn();
    await pollLoreBookNotice('msg-1', 'token', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

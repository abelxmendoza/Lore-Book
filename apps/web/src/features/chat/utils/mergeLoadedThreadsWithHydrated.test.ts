import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mergeLoadedThreadsWithHydrated,
  resolveThreadUpdatedAt,
  LOCAL_ACTIVITY_GRACE_MS,
} from './mergeLoadedThreadsWithHydrated';
import type { ChatThread } from '../hooks/useChatThreads';

function thread(
  id: string,
  messages: ChatThread['messages'] = [],
  updatedAt = '2026-06-01T00:00:00Z'
): ChatThread {
  return { id, title: 'Test', messages, updatedAt };
}

describe('resolveThreadUpdatedAt', () => {
  it('keeps server time when local is older or equal', () => {
    expect(resolveThreadUpdatedAt('2026-06-02T00:00:00Z', '2026-06-01T00:00:00Z')).toBe(
      '2026-06-02T00:00:00Z'
    );
  });

  it('keeps a very recent local bump until the server catches up', () => {
    const now = Date.parse('2026-06-02T00:00:30Z');
    const local = '2026-06-02T00:00:20Z';
    const server = '2026-06-02T00:00:00Z';
    expect(resolveThreadUpdatedAt(server, local, now)).toBe(local);
  });

  it('drops stale local bumps outside the grace window', () => {
    const now = Date.parse('2026-06-02T00:02:00Z');
    const local = new Date(now - LOCAL_ACTIVITY_GRACE_MS - 1).toISOString();
    const server = '2026-06-02T00:00:00Z';
    expect(resolveThreadUpdatedAt(server, local, now)).toBe(server);
  });
});

describe('mergeLoadedThreadsWithHydrated', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns loaded threads sorted newest-first when there is no prior cache', () => {
    const loaded = [
      thread('a', [], '2026-01-01T00:00:00Z'),
      thread('b', [], '2026-06-01T00:00:00Z'),
    ];
    expect(mergeLoadedThreadsWithHydrated(loaded, []).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('preserves hydrated messages but keeps server updatedAt for list order', () => {
    const hydrated = thread(
      'a',
      [{ id: 'm1', role: 'user', content: 'hello', timestamp: new Date('2026-06-02T00:00:00Z') }],
      '2026-06-02T00:00:00Z'
    );
    const loaded = [{ ...thread('a', [], '2026-06-01T00:00:00Z'), messageCount: 2, title: 'Last chat' }];

    const merged = mergeLoadedThreadsWithHydrated(loaded, [hydrated]);

    expect(merged[0].messages).toHaveLength(1);
    expect(merged[0].messages[0]?.content).toBe('hello');
    expect(merged[0].messageCount).toBe(2);
    expect(merged[0].title).toBe('Last chat');
    // Stale local bump is outside grace relative to "now", so server wins.
    expect(merged[0].updatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('orders by server updatedAt even when local messages are fresher', () => {
    const localHot = thread(
      'phone',
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-06-10T00:00:00Z') }],
      '2026-06-10T00:00:00Z'
    );
    const localCold = thread('desktop', [], '2026-06-05T00:00:00Z');
    const loaded = [
      thread('phone', [], '2026-06-01T00:00:00Z'),
      thread('desktop', [], '2026-06-05T00:00:00Z'),
    ];

    const merged = mergeLoadedThreadsWithHydrated(loaded, [localHot, localCold]);

    expect(merged.map((t) => t.id)).toEqual(['desktop', 'phone']);
    expect(merged[0].updatedAt).toBe('2026-06-05T00:00:00Z');
    expect(merged[1].messages).toHaveLength(1);
  });

  it('keeps an in-flight local activity bump during quiet refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T12:00:10Z'));

    const local = thread('active', [], '2026-06-02T12:00:05Z');
    const loaded = [thread('active', [], '2026-06-02T11:59:00Z'), thread('other', [], '2026-06-02T11:58:00Z')];

    const merged = mergeLoadedThreadsWithHydrated(loaded, [local]);

    expect(merged[0].id).toBe('active');
    expect(merged[0].updatedAt).toBe('2026-06-02T12:00:05Z');
  });

  it('keeps recent pending local-only threads not yet on the server', () => {
    const loaded = [thread('server-a', [], '2026-06-01T00:00:00Z')];
    const pending = thread('local-draft', [], new Date().toISOString());

    const merged = mergeLoadedThreadsWithHydrated(loaded, [pending]);

    expect(merged.map((t) => t.id)).toContain('local-draft');
    expect(merged.map((t) => t.id)).toContain('server-a');
    expect(merged[0].id).toBe('local-draft');
  });

  it('drops stale empty pending local drafts older than the TTL', () => {
    const loaded = [thread('server-a', [], '2026-06-01T00:00:00Z')];
    const stalePending = thread('stale-draft', [], '2020-01-01T00:00:00Z');

    const merged = mergeLoadedThreadsWithHydrated(loaded, [stalePending]);

    expect(merged.map((t) => t.id)).toEqual(['server-a']);
  });
});

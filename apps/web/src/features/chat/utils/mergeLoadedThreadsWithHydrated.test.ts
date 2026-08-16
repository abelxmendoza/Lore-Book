import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mergeLoadedThreadsWithHydrated,
  resolveThreadUpdatedAt,
  LOCAL_ACTIVITY_GRACE_MS,
} from './mergeLoadedThreadsWithHydrated';
import { threadPersistenceTracker } from '../services/threadPersistenceTracker';
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

  // ── Stale/deleted-thread resurrection (P1) ────────────────────────────────
  // A thread with real messages absent from a fresh, full server page is
  // ambiguous by itself: it could be genuinely off-page (paginated out) or
  // deleted/renamed on another device. These cases disambiguate using the
  // page's own age range and the persistence tracker's genuine-pending state.

  it('keeps a cached thread with messages that is plausibly just off-page (older than the loaded page)', () => {
    const loaded = Array.from({ length: 30 }, (_, i) =>
      thread(`server-${i}`, [], `2026-06-${String(30 - i).padStart(2, '0')}T00:00:00Z`)
    ); // full 30-row page, oldest row is 2026-06-01
    const offPage = thread(
      'off-page-real',
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-05-01T00:00:00Z') }],
      '2026-05-01T00:00:00Z' // older than every row on the page
    );

    const merged = mergeLoadedThreadsWithHydrated(loaded, [offPage], 30);

    expect(merged.map((t) => t.id)).toContain('off-page-real');
  });

  it('drops a cached thread with messages that is absent from a full page but newer than everything on it (deleted elsewhere)', () => {
    const loaded = Array.from({ length: 30 }, (_, i) =>
      thread(`server-${i}`, [], `2026-06-${String(30 - i).padStart(2, '0')}T00:00:00Z`)
    ); // full 30-row page, oldest row is 2026-06-01
    const deletedElsewhere = thread(
      'deleted-real',
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-07-01T00:00:00Z') }],
      '2026-07-01T00:00:00Z' // newer than everything on the page — should have been on it
    );

    const merged = mergeLoadedThreadsWithHydrated(loaded, [deletedElsewhere], 30);

    expect(merged.map((t) => t.id)).not.toContain('deleted-real');
  });

  it('keeps a genuinely-pending thread with messages regardless of the page window', () => {
    threadPersistenceTracker.markPersistPending('genuinely-pending', 1);
    try {
      const loaded = Array.from({ length: 30 }, (_, i) =>
        thread(`server-${i}`, [], `2026-06-${String(30 - i).padStart(2, '0')}T00:00:00Z`)
      );
      const pendingWrite = thread(
        'genuinely-pending',
        [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-07-01T00:00:00Z') }],
        '2026-07-01T00:00:00Z' // newer than the page — would be dropped if not for the pending state
      );

      const merged = mergeLoadedThreadsWithHydrated(loaded, [pendingWrite], 30);

      expect(merged.map((t) => t.id)).toContain('genuinely-pending');
    } finally {
      threadPersistenceTracker.remove('genuinely-pending');
    }
  });

  it('keeps a cached thread with messages absent from a page that was not even full (nothing could be paginated out)', () => {
    const loaded = [thread('server-a', [], '2026-06-01T00:00:00Z')]; // far short of the 30 limit
    const notOnServerYet = thread(
      'small-page-real',
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-08-01T00:00:00Z') }],
      '2026-08-01T00:00:00Z'
    );

    const merged = mergeLoadedThreadsWithHydrated(loaded, [notOnServerYet], 30);

    expect(merged.map((t) => t.id)).toContain('small-page-real');
  });
});

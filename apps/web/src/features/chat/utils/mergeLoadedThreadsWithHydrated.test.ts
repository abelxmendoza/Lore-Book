import { describe, it, expect, vi, afterEach } from 'vitest';
import { mergeLoadedThreadsWithHydrated } from './mergeLoadedThreadsWithHydrated';
import type { ChatThread } from '../hooks/useChatThreads';

function thread(
  id: string,
  messages: ChatThread['messages'] = [],
  updatedAt = '2026-06-01T00:00:00Z',
  extras: Partial<ChatThread> = {}
): ChatThread {
  return { id, title: 'Test', messages, updatedAt, ...extras };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mergeLoadedThreadsWithHydrated', () => {
  it('returns loaded threads when there is no prior cache', () => {
    const loaded = [thread('a', [], '2026-06-02T00:00:00Z'), thread('b', [], '2026-06-01T00:00:00Z')];
    expect(mergeLoadedThreadsWithHydrated(loaded, []).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('preserves hydrated messages when the server list arrives', () => {
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
    expect(merged[0].updatedAt).toBe('2026-06-02T00:00:00Z');
  });

  it('keeps optimistic local-only threads that the server has not acked yet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));

    const pending = thread(
      'local-new',
      [{ id: 'm1', role: 'user', content: 'just asked', timestamp: new Date('2026-06-10T11:59:00Z') }],
      '2026-06-10T11:59:00Z',
      { title: 'Brand new chat' }
    );
    const loaded = [thread('server-a', [], '2026-06-09T00:00:00Z', { title: 'Older' })];

    const merged = mergeLoadedThreadsWithHydrated(loaded, [pending]);

    expect(merged.map((t) => t.id)).toEqual(['local-new', 'server-a']);
    expect(merged[0].title).toBe('Brand new chat');
  });

  it('sorts by activity so prompted threads stay on top across reloads', () => {
    const prev = [
      thread('old', [], '2026-06-01T00:00:00Z'),
      thread('fresh', [], '2026-06-10T18:00:00Z'),
    ];
    const loaded = [
      thread('old', [], '2026-06-01T00:00:00Z'),
      // Server lag: slightly older stamp than local bump
      thread('fresh', [], '2026-06-10T17:59:00Z'),
    ];

    const merged = mergeLoadedThreadsWithHydrated(loaded, prev);
    expect(merged.map((t) => t.id)).toEqual(['fresh', 'old']);
    expect(merged[0].updatedAt).toBe('2026-06-10T18:00:00Z');
  });

  it('prefers a derived local title over a generic server draft title', () => {
    const prev = [thread('a', [], '2026-06-02T00:00:00Z', { title: 'Trip planning' })];
    const loaded = [thread('a', [], '2026-06-02T00:00:00Z', { title: 'New chat' })];

    const merged = mergeLoadedThreadsWithHydrated(loaded, prev);
    expect(merged[0].title).toBe('Trip planning');
  });
});

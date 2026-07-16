import { describe, it, expect } from 'vitest';
import { mergeLoadedThreadsWithHydrated } from './mergeLoadedThreadsWithHydrated';
import type { ChatThread } from '../hooks/useChatThreads';

function thread(
  id: string,
  messages: ChatThread['messages'] = [],
  updatedAt = '2026-06-01T00:00:00Z'
): ChatThread {
  return { id, title: 'Test', messages, updatedAt };
}

describe('mergeLoadedThreadsWithHydrated', () => {
  it('returns loaded threads sorted newest-first when there is no prior cache', () => {
    const loaded = [
      thread('a', [], '2026-01-01T00:00:00Z'),
      thread('b', [], '2026-06-01T00:00:00Z'),
    ];
    expect(mergeLoadedThreadsWithHydrated(loaded, []).map((t) => t.id)).toEqual(['b', 'a']);
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

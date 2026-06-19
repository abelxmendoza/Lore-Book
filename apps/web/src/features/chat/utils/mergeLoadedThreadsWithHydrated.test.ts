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
  it('returns loaded threads when there is no prior cache', () => {
    const loaded = [thread('a'), thread('b')];
    expect(mergeLoadedThreadsWithHydrated(loaded, [])).toEqual(loaded);
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
});

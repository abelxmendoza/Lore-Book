import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistAuthThreadCache,
  readAuthThreadCache,
  readAuthThreadFromCache,
} from './threadLocalCache';
import type { ChatThread } from '../hooks/useChatThreads';

const USER_ID = 'user-cache-1';
const THREAD: ChatThread = {
  id: 'thread-cache-1',
  title: 'Cache test',
  messages: [
    {
      id: 'u1',
      role: 'user',
      content: 'Hello cache',
      timestamp: new Date('2026-06-01T00:00:00Z'),
    },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Cached assistant reply',
      timestamp: new Date('2026-06-01T00:00:01Z'),
      isStreaming: false,
    },
  ],
  updatedAt: '2026-06-01T00:00:01Z',
};

describe('threadLocalCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and reads authenticated thread cache', () => {
    persistAuthThreadCache(USER_ID, [THREAD], THREAD.id);
    const cache = readAuthThreadCache(USER_ID);
    expect(cache?.lastThreadId).toBe(THREAD.id);
    expect(cache?.threads[0].messages).toHaveLength(2);
    expect(cache?.threads[0].messages[1].content).toContain('Cached assistant');
  });

  it('reads a single thread from cache by id', () => {
    persistAuthThreadCache(USER_ID, [THREAD], THREAD.id);
    const row = readAuthThreadFromCache(USER_ID, THREAD.id);
    expect(row?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

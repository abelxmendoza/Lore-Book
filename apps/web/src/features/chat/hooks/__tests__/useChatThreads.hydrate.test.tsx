import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import type { Message } from '../../message/ChatMessage';

vi.mock('../../../../lib/supabase', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

// Exercise the real (non-demo) runtime; demo mode defaults ON under vitest.
vi.mock('../../../../services/demoChatSimulation', async (orig) => ({
  ...(await orig<typeof import('../../../../services/demoChatSimulation')>()),
  isDemoChatMockup: () => false,
  seedDemoChatThreadsIfEmpty: (threads: unknown) => threads,
}));

vi.mock('../../services/runtimeDiagnostics', () => ({
  runtimeDiagnostics: {
    record: vi.fn(),
    startTimer: vi.fn(),
    recordTimed: vi.fn(),
  },
}));

vi.mock('../../services/threadPersistenceTracker', () => ({
  threadPersistenceTracker: {
    markRestoredFromBackend: vi.fn(),
    markPersistPending: vi.fn(),
    markPersisted: vi.fn(),
    markSyncFailed: vi.fn(),
    markLocalOnly: vi.fn(),
    markRestoredFromLocal: vi.fn(),
    markOffline: vi.fn(),
    remove: vi.fn(),
  },
}));

import { useAuth } from '../../../../lib/supabase';
import { fetchJson } from '../../../../lib/api';
import { renderUseChatThreads } from './chatTestUtils';
import { persistAuthThreadCache } from '../../utils/threadLocalCache';

const mockUseAuth = vi.mocked(useAuth);
const mockFetchJson = vi.mocked(fetchJson);

function msg(id: string, role: 'user' | 'assistant', content: string, extra?: Partial<Message>): Message {
  return { id, role, content, timestamp: new Date(), ...extra };
}

function mockAuthenticatedBoot() {
  mockUseAuth.mockReturnValue({
    user: { id: 'user-hydrate-1' } as never,
    loading: false,
    session: null,
    signOut: vi.fn(),
  });
  mockFetchJson.mockImplementation(async (url: string, opts?: RequestInit & { method?: string }) => {
    const method = opts?.method;
    if (method === 'DELETE' && String(url).includes('/threads/')) {
      throw new Error('409 protected');
    }
    if (url.includes('/threads/recover-orphans')) return { success: true, recovered: 0 };
    if (url.includes('health/repair')) return { repaired: 0, report: {} };
    if (url.includes('/threads?')) {
      return {
        success: true,
        threads: [
          {
            id: 'thread-1',
            title: 'Test',
            updated_at: '2026-06-01T00:00:00Z',
            metadata: {},
          },
        ],
        total: 1,
        hasMore: false,
        nextCursor: null,
      };
    }
    if (url.includes('/ensure-visible')) {
      return { success: true, thread: { title: 'Test', updatedAt: '2026-06-01T00:00:00Z' } };
    }
    if (url.includes('/messages')) {
      return {
        success: true,
        messages: [
          { id: 'db-u1', role: 'user', content: 'Who is Jerry?', created_at: '2026-06-01T00:00:00Z' },
        ],
      };
    }
    return { success: true };
  });
}

describe('useChatThreads.hydrateThreadMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthenticatedBoot();
  });

  it('merges local assistant bubble when server returns user-only snapshot', async () => {
    const { result } = renderUseChatThreads();

    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    act(() => {
      result.current.updateThread('thread-1', {
        messages: [
          msg('local-u1', 'user', 'Who is Jerry?'),
          msg('local-a1', 'assistant', 'Jerry is from the LifeLedger era.'),
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.getThread('thread-1')?.messages).toHaveLength(2);
    });

    await act(async () => {
      await result.current.hydrateThreadMessages('thread-1');
    });

    const thread = result.current.getThread('thread-1');
    expect(thread?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(thread?.messages.find((m) => m.role === 'assistant')?.content).toContain('LifeLedger');
  });

  it('does not erase a local assistant when the server returns an empty same-id placeholder', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        return {
          success: true,
          messages: [
            { id: 'db-u1', role: 'user', content: 'Who is Jerry?', created_at: '2026-06-01T00:00:00Z' },
            { id: 'db-a1', role: 'assistant', content: '', created_at: '2026-06-01T00:00:01Z' },
          ],
        };
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [{ id: 'thread-1', title: 'T', updated_at: new Date().toISOString(), metadata: {} }],
          total: 1,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) return { success: true };
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    act(() => {
      result.current.updateThread('thread-1', {
        messages: [
          msg('db-u1', 'user', 'Who is Jerry?'),
          msg('db-a1', 'assistant', 'Jerry is from the LifeLedger era.'),
        ],
      });
    });

    await act(async () => {
      await result.current.hydrateThreadMessages('thread-1');
    });

    const assistant = result.current.getThread('thread-1')?.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('LifeLedger');
  });

  it('returns existing thread on hydrate fetch failure when local messages exist', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) throw new Error('Network error');
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [{ id: 'thread-1', title: 'T', updated_at: new Date().toISOString(), metadata: {} }],
          total: 1,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) return { success: true };
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    act(() => {
      result.current.updateThread('thread-1', {
        messages: [msg('local-u1', 'user', 'keep me'), msg('local-a1', 'assistant', 'and me too')],
      });
    });

    let hydrated: Awaited<ReturnType<typeof result.current.hydrateThreadMessages>> = null;
    await act(async () => {
      hydrated = await result.current.hydrateThreadMessages('thread-1');
    });

    expect(hydrated?.messages).toHaveLength(2);
  });

  it('throws on hydrate fetch failure when the thread has no local messages', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        throw Object.assign(new Error('Network error'), { status: 503 });
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [{ id: 'thread-1', title: 'T', updated_at: new Date().toISOString(), metadata: {} }],
          total: 1,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) return { success: true };
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    await act(async () => {
      await expect(result.current.hydrateThreadMessages('thread-1')).rejects.toThrow(/Network error|Request failed/);
    });
  });

  it('returns null for an authoritative 404 so a missing URL can redirect', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        throw Object.assign(new Error('Thread not found'), { status: 404 });
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return { success: true, threads: [], total: 0, hasMore: false };
      }
      if (url.includes('/ensure-visible')) return { success: true };
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    let hydrated: Awaited<ReturnType<typeof result.current.hydrateThreadMessages>> = undefined as never;
    await act(async () => {
      hydrated = await result.current.hydrateThreadMessages('missing-thread');
    });
    expect(hydrated).toBeNull();
  });

  it('hydrates mentionedEntities from assistant message metadata', async () => {
    mockFetchJson.mockImplementation(async (url: string, opts?: RequestInit & { method?: string }) => {
      const method = opts?.method;
      if (method === 'DELETE' && String(url).includes('/threads/')) {
        throw new Error('409 protected');
      }
      if (url.includes('/threads/recover-orphans')) return { success: true, recovered: 0 };
      if (url.includes('health/repair')) return { repaired: 0, report: {} };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [
            {
              id: 'thread-entities',
              title: 'Entity reload',
              updated_at: '2026-06-01T00:00:02Z',
              metadata: {},
            },
          ],
          total: 1,
          hasMore: false,
          nextCursor: null,
        };
      }
      if (url.includes('/ensure-visible')) {
        return { success: true, thread: { title: 'Entity reload', updatedAt: '2026-06-01T00:00:02Z' } };
      }
      if (url.includes('/messages')) {
        return {
          success: true,
          messages: [
            {
              id: 'db-u-entities',
              role: 'user',
              content: 'I visited Tía Maria in San Diego.',
              created_at: '2026-06-01T00:00:00Z',
              metadata: {},
            },
            {
              id: 'db-a-entities',
              role: 'assistant',
              content: 'That sounds like a meaningful visit.',
              created_at: '2026-06-01T00:00:01Z',
              metadata: {
                mentionedEntities: [
                  { id: 'c1', name: 'Tía Maria', type: 'character' },
                  { id: 'l1', name: 'San Diego', type: 'location' },
                ],
                saved_from_stream: true,
              },
            },
          ],
        };
      }
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    await act(async () => {
      await result.current.hydrateThreadMessages('thread-entities');
    });

    const assistant = result.current.getThread('thread-entities')?.messages.find((m) => m.role === 'assistant');
    expect(assistant?.mentionedEntities).toEqual([
      { id: 'c1', name: 'Tía Maria', type: 'character' },
      { id: 'l1', name: 'San Diego', type: 'location' },
    ]);
  });

  it('restores thread in list when protected delete fails', async () => {
    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    act(() => {
      result.current.updateThread('thread-1', {
        messages: [msg('u1', 'user', 'protected thread')],
        updatedAt: new Date().toISOString(),
      });
    });

    await act(async () => {
      result.current.deleteThread('thread-1');
    });

    await waitFor(() => {
      expect(result.current.threads.some((t) => t.id === 'thread-1')).toBe(true);
    });
  });

  it('reports an authenticated load error without declaring the list empty', async () => {
    persistAuthThreadCache(
      'user-hydrate-1',
      [{
        id: 'cached-thread',
        title: 'Cached conversation',
        messages: [msg('cached-u1', 'user', 'keep this conversation')],
        updatedAt: '2026-06-02T00:00:00Z',
      }],
      'cached-thread',
    );
    mockFetchJson.mockRejectedValue(new Error('Network unavailable'));

    const { result } = renderUseChatThreads();

    await waitFor(() => expect(result.current.threadListState.status).toBe('error'));
    expect(result.current.threads.map((thread) => thread.id)).toEqual(['cached-thread']);
    expect(result.current.threadsReady).toBe(false);
    expect(result.current.threadListState).toEqual({
      status: 'error',
      error: 'Network unavailable',
    });
    expect(localStorage.getItem('lorekeeper_chat_threads_user-hydrate-1')).toBeNull();
  });

  it('keeps a cached assistant reply when hydrating after a cold login', async () => {
    persistAuthThreadCache(
      'user-hydrate-1',
      [{
        id: 'thread-1',
        title: 'Test',
        messages: [
          msg('db-u1', 'user', 'Who is Jerry?'),
          msg('db-a1', 'assistant', 'Jerry is from the LifeLedger era.'),
        ],
        updatedAt: '2026-06-01T00:00:00Z',
      }],
      'thread-1',
    );
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        return {
          success: true,
          messages: [
            { id: 'db-u1', role: 'user', content: 'Who is Jerry?', created_at: '2026-06-01T00:00:00Z' },
            { id: 'db-a1', role: 'assistant', content: '', created_at: '2026-06-01T00:00:01Z' },
          ],
        };
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [{ id: 'thread-1', title: 'Test', updated_at: '2026-06-01T00:00:00Z', metadata: {} }],
          total: 1,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) {
        return { success: true, thread: { title: 'Test', updatedAt: '2026-06-01T00:00:00Z' } };
      }
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    await act(async () => {
      await result.current.hydrateThreadMessages('thread-1');
    });

    const assistant = result.current.getThread('thread-1')?.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('LifeLedger');
  });

  it('does not drop an in-flight send down the list when hydrate returns a lagging stamp', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        return {
          success: true,
          messages: [
            { id: 'db-u1', role: 'user', content: 'Who is Jerry?', created_at: '2026-06-02T12:00:05Z' },
            { id: 'db-a1', role: 'assistant', content: 'Jerry is from the LifeLedger era.', created_at: '2026-06-02T12:00:06Z' },
          ],
        };
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [
            { id: 'thread-1', title: 'Just sent', updated_at: '2026-06-02T11:59:00Z', metadata: {} },
            { id: 'thread-2', title: 'Older chat', updated_at: '2026-06-02T11:58:00Z', metadata: {} },
          ],
          total: 2,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) {
        return { success: true, thread: { title: 'Just sent', updatedAt: '2026-06-02T11:59:00Z' } };
      }
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-02T12:00:10Z'));
    try {
      act(() => {
        result.current.updateThread('thread-1', {
          messages: [
            msg('db-u1', 'user', 'Who is Jerry?'),
            msg('db-a1', 'assistant', 'Jerry is from the LifeLedger era.'),
          ],
          updatedAt: '2026-06-02T12:00:05Z',
          touchActivity: true,
        });
      });

      expect(result.current.threads.map((t) => t.id)).toEqual(['thread-1', 'thread-2']);

      await act(async () => {
        await result.current.hydrateThreadMessages('thread-1');
      });

      expect(result.current.threads.map((t) => t.id)).toEqual(['thread-1', 'thread-2']);
      expect(result.current.getThread('thread-1')?.updatedAt).toBe('2026-06-02T12:00:05Z');
      expect(result.current.getThread('thread-1')?.messages.find((m) => m.role === 'assistant')?.content)
        .toContain('LifeLedger');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('snaps to the other device order once a local activity bump is stale', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('/messages')) {
        return {
          success: true,
          messages: [
            { id: 'db-u1', role: 'user', content: 'old question', created_at: '2026-06-02T11:50:00Z' },
            { id: 'db-a1', role: 'assistant', content: 'old answer', created_at: '2026-06-02T11:50:01Z' },
          ],
        };
      }
      if (url.includes('/threads/recover-orphans')) return { success: true };
      if (url.includes('health/repair')) return { repaired: 0 };
      if (url.includes('/threads?')) {
        return {
          success: true,
          threads: [
            { id: 'thread-other', title: 'Other device', updated_at: '2026-06-02T12:00:00Z', metadata: {} },
            { id: 'thread-1', title: 'Stale bump', updated_at: '2026-06-02T11:50:00Z', metadata: {} },
          ],
          total: 2,
          hasMore: false,
        };
      }
      if (url.includes('/ensure-visible')) {
        return { success: true, thread: { title: 'Stale bump', updatedAt: '2026-06-02T11:50:00Z' } };
      }
      return { success: true };
    });

    const { result } = renderUseChatThreads();
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-02T12:02:00Z'));
    try {
      act(() => {
        result.current.updateThread('thread-1', {
          updatedAt: '2026-06-02T12:00:59Z',
          touchActivity: true,
        });
      });

      // Local bump is newer than the other device, but outside the 60s grace window.
      expect(result.current.threads.map((t) => t.id)[0]).toBe('thread-1');

      await act(async () => {
        await result.current.hydrateThreadMessages('thread-1');
      });

      expect(result.current.threads.map((t) => t.id)).toEqual(['thread-other', 'thread-1']);
      expect(result.current.getThread('thread-1')?.updatedAt).toBe('2026-06-02T11:50:00Z');
      expect(result.current.getThread('thread-1')?.messages.find((m) => m.role === 'assistant')?.content)
        .toBe('old answer');
    } finally {
      nowSpy.mockRestore();
    }
  });
});

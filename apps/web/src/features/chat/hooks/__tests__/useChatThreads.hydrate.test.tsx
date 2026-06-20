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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ChatThreadProvider } from '../../../contexts/ChatThreadContext';
import { mergeThreadMessages } from '../utils/mergeThreadMessages';
import type { Message } from '../message/ChatMessage';

vi.mock('../../../lib/supabase', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../services/runtimeDiagnostics', () => ({
  runtimeDiagnostics: { record: vi.fn(), startTimer: vi.fn(), recordTimed: vi.fn() },
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

import { useAuth } from '../../../lib/supabase';
import { fetchJson } from '../../../lib/api';
import { useChatThreadContext } from '../../../contexts/ChatThreadContext';

const mockUseAuth = vi.mocked(useAuth);
const mockFetchJson = vi.mocked(fetchJson);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, React.createElement(ChatThreadProvider, null, children));
}

function msg(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, role, content, timestamp: new Date() };
}

function mockAuthenticatedBoot() {
  mockUseAuth.mockReturnValue({
    user: { id: 'integration-user' } as never,
    loading: false,
    session: null,
    signOut: vi.fn(),
  });
  mockFetchJson.mockImplementation(async (url: string) => {
    if (url.includes('health/repair')) return { repaired: 0, report: {} };
    if (url.includes('recover-orphans')) return { success: true, recovered: 0 };
    if (url.includes('/threads?')) {
      return {
        success: true,
        threads: [{ id: 't-int', title: 'Integration', updated_at: new Date().toISOString(), metadata: {} }],
        total: 1,
        hasMore: false,
      };
    }
    if (url.includes('/messages')) {
      return {
        success: true,
        messages: [
          { id: 'srv-u', role: 'user', content: 'Question one', created_at: '2026-06-01T00:00:00Z' },
          { id: 'srv-a', role: 'assistant', content: 'Answer one', created_at: '2026-06-01T00:00:01Z' },
        ],
      };
    }
    if (url.includes('/ensure-visible')) return { success: true };
    return { success: true };
  });
}

describe('Conversation durability integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthenticatedBoot();
  });

  it('hydrates full conversation into canonical thread cache', async () => {
    const { result } = renderHook(() => useChatThreadContext(), { wrapper });

    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    await act(async () => {
      await result.current.hydrateThreadMessages('t-int');
    });

    const thread = result.current.getThread('t-int');
    expect(thread?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('merge utility preserves multi-turn conversations across sources', () => {
    const local = [
      msg('u1', 'user', 'Q1'),
      msg('a1', 'assistant', 'A1'),
      msg('u2', 'user', 'Q2'),
    ];
    const server = [
      msg('db-u1', 'user', 'Q1'),
      msg('db-a1', 'assistant', 'A1'),
      msg('db-u2', 'user', 'Q2'),
      msg('db-a2', 'assistant', 'A2'),
    ];
    const merged = mergeThreadMessages(local, server);
    expect(merged).toHaveLength(4);
    expect(merged[3].content).toBe('A2');
    expect(merged[3].id).toBe('db-a2');
  });

  it('survives transient API failure without wiping cached messages', async () => {
    mockFetchJson.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useChatThreadContext(), { wrapper });

    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    act(() => {
      result.current.createThread();
    });

    const createdId = result.current.threads[0]?.id;
    expect(createdId).toBeTruthy();

    act(() => {
      result.current.mutateThreadMessagesForThread(createdId!, () => [
        msg('u', 'user', 'cached'),
        msg('a', 'assistant', 'still here'),
      ]);
    });

    expect(result.current.getThread(createdId!)?.messages).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
    exposeOnWindow: vi.fn(),
  },
}));

const mockUseChatThreadContext = vi.fn();
vi.mock('../../../../contexts/ChatThreadContext', () => ({
  useChatThreadContext: () => mockUseChatThreadContext(),
}));

import { useAuth } from '../../../../lib/supabase';
import { fetchJson } from '../../../../lib/api';
import { runtimeDiagnostics } from '../../services/runtimeDiagnostics';
import { useConversationRuntime } from '../useConversationRuntime';
import type { Message } from '../../message/ChatMessage';

const mockUseAuth = vi.mocked(useAuth);
const mockFetchJson = vi.mocked(fetchJson);

function ensureLocalStorage() {
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') return;
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  });
}

function makeMessage(role: 'user' | 'assistant', content = 'hello'): Message {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, content, timestamp: new Date() };
}

function makeThread(id: string, messages: Message[] = [], title = 'New chat') {
  return { id, title, messages, updatedAt: new Date().toISOString() };
}

function makeContextStore(
  opts: {
    threads?: ReturnType<typeof makeThread>[];
    loading?: boolean;
    ready?: boolean;
    currentThreadId?: string | null;
    activeThreadId?: string | null;
    activeMessages?: Message[];
  } = {}
) {
  const threads = opts.threads ?? [];
  const activeThreadId = opts.activeThreadId ?? null;
  const activeMessages =
    opts.activeMessages ??
    (activeThreadId ? threads.find((t) => t.id === activeThreadId)?.messages ?? [] : []);

  return {
    threads,
    threadsLoading: opts.loading ?? false,
    threadsReady: opts.ready ?? true,
    currentThreadId: opts.currentThreadId ?? null,
    activeThreadId,
    activeMessages,
    setActiveThreadId: vi.fn(),
    updateActiveMessages: vi.fn(),
    clearActiveMessages: vi.fn(),
    setCurrentThreadId: vi.fn(),
    createThread: vi.fn(() => 'new-thread-id'),
    getThread: vi.fn((id: string) => threads.find((t) => t.id === id)),
    hydrateThreadMessages: vi.fn(async (id: string) => {
      const t = threads.find((th) => th.id === id);
      return t && t.messages.length > 0 ? t : null;
    }),
    switchThread: vi.fn(),
    updateThread: vi.fn(),
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    flushSave: vi.fn(),
    loadThreads: vi.fn(),
  };
}

function makeWrapper(initialPath = '/chat') {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: '/chat', element: children }),
        React.createElement(Route, { path: '/chat/:threadId', element: children })
      )
    );
}

describe('useConversationRuntime', () => {
  beforeEach(() => {
    ensureLocalStorage();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' } as any,
      loading: false,
      session: null,
      signOut: vi.fn(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('activates the thread in the URL on mount', async () => {
    const thread = makeThread('t1', [makeMessage('user', 'hi')]);
    const store = makeContextStore({ threads: [thread] });
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t1'),
    });

    await waitFor(() => {
      expect(store.setActiveThreadId).toHaveBeenCalledWith('t1');
    });
    expect(store.switchThread).toHaveBeenCalledWith('t1');
    expect(runtimeDiagnostics.startTimer).toHaveBeenCalledWith('hydration');
    expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
      'hydration_complete',
      'hydration',
      expect.objectContaining({ threadId: 't1' })
    );
  });

  it('clears active thread when URL threadId is absent', async () => {
    const store = makeContextStore();
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat'),
    });

    await waitFor(() => {
      expect(store.setActiveThreadId).toHaveBeenCalledWith(null);
    });
    expect(store.switchThread).not.toHaveBeenCalled();
  });

  it('waits while auth is loading before hydrating', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, session: null, signOut: vi.fn() });
    const store = makeContextStore({ loading: false });
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t1'),
    });

    expect(store.setActiveThreadId).not.toHaveBeenCalled();
    expect(store.switchThread).not.toHaveBeenCalled();
  });

  it('waits while threads are loading before hydrating', () => {
    const store = makeContextStore({ loading: true });
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t1'),
    });

    expect(store.setActiveThreadId).not.toHaveBeenCalled();
  });

  it('skips URL hydration when handler already loaded the thread', async () => {
    const thread = makeThread('t1', [makeMessage('user')]);
    const store = makeContextStore({ threads: [thread] });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat'),
    });

    act(() => {
      result.current.handleSelectThread('t1');
    });

    await waitFor(() => {
      expect(store.setActiveThreadId).toHaveBeenCalledWith('t1');
    });

    expect(store.switchThread).toHaveBeenCalledWith('t1');
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'hydration_skip',
      expect.objectContaining({ threadId: 't1' })
    );
  });

  it('does not clear active thread on /chat while selecting a sidebar thread', async () => {
    const thread = makeThread('t1', [makeMessage('user')]);
    const setActiveCalls: Array<string | null> = [];
    const store = makeContextStore({ threads: [thread] });
    store.setActiveThreadId.mockImplementation((id: string | null) => {
      setActiveCalls.push(id);
    });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat'),
    });

    await waitFor(() => {
      expect(store.setActiveThreadId).toHaveBeenCalledWith(null);
    });

    setActiveCalls.length = 0;

    act(() => {
      void result.current.handleSelectThread('t1');
    });

    await waitFor(() => {
      expect(setActiveCalls.some((id) => id === 't1')).toBe(true);
    });

    expect(setActiveCalls.includes(null)).toBe(false);
  });

  it('ignores a stale async thread hydration after a newer thread is selected', async () => {
    const slowMessage = makeMessage('user', 'slow thread');
    const fastMessage = makeMessage('user', 'fast thread');
    let resolveSlow: (value: ReturnType<typeof makeThread>) => void = () => {};
    const slowHydration = new Promise<ReturnType<typeof makeThread>>((resolve) => {
      resolveSlow = resolve;
    });
    const fastThread = makeThread('fast', [fastMessage]);
    const store = makeContextStore({
      threads: [makeThread('slow', []), makeThread('fast', [])],
    });
    store.hydrateThreadMessages.mockImplementation(async (id: string) => {
      if (id === 'slow') return slowHydration;
      if (id === 'fast') return fastThread;
      return null;
    });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat'),
    });

    act(() => {
      void result.current.handleSelectThread('slow');
    });
    act(() => {
      void result.current.handleSelectThread('fast');
    });

    await waitFor(() => {
      expect(store.setActiveThreadId).toHaveBeenCalledWith('fast');
    });

    await act(async () => {
      resolveSlow(makeThread('slow', [slowMessage]));
      await slowHydration;
    });

    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'hydration_skip',
      expect.objectContaining({
        threadId: 'slow',
        meta: { reason: 'stale_thread_select' },
      })
    );
  });

  it('handleNewChat flushes current thread and creates a new one', async () => {
    const store = makeContextStore({ currentThreadId: 'old-thread' });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/old-thread'),
    });

    act(() => {
      result.current.handleNewChat();
    });

    expect(store.flushSave).toHaveBeenCalledWith('old-thread');
    expect(store.createThread).toHaveBeenCalled();
    expect(store.setActiveThreadId).toHaveBeenCalledWith('new-thread-id');
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'flush_save',
      expect.objectContaining({ threadId: 'old-thread' })
    );
  });

  it('handleDeleteThread calls deleteThread when deleting active thread', async () => {
    const t1 = makeThread('del-me', [makeMessage('user')]);
    const store = makeContextStore({ threads: [t1] });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/del-me'),
    });

    act(() => {
      result.current.handleDeleteThread('del-me');
    });

    expect(store.deleteThread).toHaveBeenCalledWith('del-me');
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'thread_delete',
      expect.objectContaining({ threadId: 'del-me' })
    );
  });

  it('handleDeleteThread navigates to next thread when available', async () => {
    const t1 = makeThread('del-me');
    const t2 = makeThread('next-one', [makeMessage('assistant', 'hi')]);
    const store = makeContextStore({ threads: [t1, t2] });
    mockUseChatThreadContext.mockReturnValue(store);

    const { result } = renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/del-me'),
    });

    act(() => {
      result.current.handleDeleteThread('del-me');
    });

    expect(store.deleteThread).toHaveBeenCalledWith('del-me');
    expect(store.setActiveThreadId).toHaveBeenCalledWith('next-one');
  });

  it('fires title generation after first assistant response', async () => {
    const thread = makeThread('t1', [], 'New chat');
    const messages = [
      makeMessage('user', 'hello'),
      { ...makeMessage('assistant', 'hi there'), isStreaming: false },
    ];
    const store = makeContextStore({
      threads: [thread],
      activeThreadId: 't1',
      activeMessages: messages,
    });
    mockUseChatThreadContext.mockReturnValue(store);
    mockFetchJson.mockResolvedValueOnce({
      title: 'Great Session',
      subtitle: 'Reflection',
      success: true,
    });

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t1'),
    });

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/conversation/threads/t1/title',
        expect.objectContaining({ method: 'POST' }),
        expect.any(Object)
      );
    });

    await waitFor(() => {
      expect(store.updateThread).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ title: 'Great Session', subtitle: 'Reflection' })
      );
    });
  });

  it('records title_error when the title API call fails', async () => {
    const thread = makeThread('t2', [], 'New chat');
    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: false }];
    const store = makeContextStore({
      threads: [thread],
      activeThreadId: 't2',
      activeMessages: messages,
    });
    mockUseChatThreadContext.mockReturnValue(store);
    mockFetchJson.mockRejectedValueOnce(new Error('OpenAI 429'));

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t2'),
    });

    await waitFor(() => {
      expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
        'title_error',
        'title_t2',
        expect.objectContaining({
          threadId: 't2',
          meta: expect.objectContaining({ error: 'OpenAI 429' }),
        })
      );
    });
  });

  it('skips title generation when the thread already has a non-default title', async () => {
    const thread = makeThread('t3', [makeMessage('user', 'hello')], 'Custom Title');
    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: false }];
    const store = makeContextStore({
      threads: [thread],
      activeThreadId: 't3',
      activeMessages: messages,
    });
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t3'),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchJson).not.toHaveBeenCalled();
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'title_skip',
      expect.objectContaining({ threadId: 't3', meta: { reason: 'already_titled' } })
    );
  });

  it('does not fire title generation while the assistant message is still streaming', async () => {
    const thread = makeThread('t4', [], 'New chat');
    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: true }];
    const store = makeContextStore({
      threads: [thread],
      activeThreadId: 't4',
      activeMessages: messages,
    });
    mockUseChatThreadContext.mockReturnValue(store);

    renderHook(() => useConversationRuntime(), {
      wrapper: makeWrapper('/chat/t4'),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchJson).not.toHaveBeenCalledWith(
      '/api/conversation/threads/t4/title',
      expect.anything()
    );
  });
});

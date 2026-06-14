import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../../../../lib/supabase', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../services/runtimeDiagnostics', () => ({
  runtimeDiagnostics: {
    record: vi.fn(),
    startTimer: vi.fn(),
    recordTimed: vi.fn(),
    exposeOnWindow: vi.fn(),
  },
}));

// Mock useChatThreads with a controllable factory
const mockUseChatThreads = vi.fn();
vi.mock('../useChatThreads', () => ({
  useChatThreads: () => mockUseChatThreads(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { useAuth } from '../../../../lib/supabase';
import { fetchJson } from '../../../../lib/api';
import { runtimeDiagnostics } from '../../services/runtimeDiagnostics';
import { useConversationRuntime } from '../useConversationRuntime';
import type { Message } from '../../message/ChatMessage';

const mockUseAuth = vi.mocked(useAuth);
const mockFetchJson = vi.mocked(fetchJson);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(role: 'user' | 'assistant', content = 'hello'): Message {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, content, timestamp: new Date() };
}

function makeThread(id: string, messages: Message[] = [], title = 'New chat') {
  return { id, title, messages, updatedAt: new Date().toISOString() };
}

/** Build a stable mock threads store. */
function makeThreadsStore(opts: {
  threads?: ReturnType<typeof makeThread>[];
  loading?: boolean;
  ready?: boolean;
  currentThreadId?: string | null;
} = {}) {
  const threads = opts.threads ?? [];
  return {
    threads,
    threadsLoading: opts.loading ?? false,
    threadsReady: opts.ready ?? true,
    currentThreadId: opts.currentThreadId ?? null,
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

/** Wrapper factory for MemoryRouter at a given path. */
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

function makeRuntimeOptions(messages: Message[] = []) {
  const setMessages = vi.fn();
  const clearMessages = vi.fn();
  return { messages, setMessages, clearMessages };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useConversationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } as any, loading: false, session: null, signOut: vi.fn() });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── URL hydration ─────────────────────────────────────────────────────────

  it('loads messages for the thread in the URL on mount', async () => {
    const thread = makeThread('t1', [makeMessage('user', 'hi')]);
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t1'),
    });

    await waitFor(() => {
      expect(opts.setMessages).toHaveBeenCalledWith(thread.messages);
    });
    expect(store.switchThread).toHaveBeenCalledWith('t1');
    expect(runtimeDiagnostics.startTimer).toHaveBeenCalledWith('hydration');
    expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
      'hydration_complete',
      'hydration',
      expect.objectContaining({ threadId: 't1' })
    );
  });

  it('does NOT load messages when URL threadId is absent', async () => {
    const store = makeThreadsStore();
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat'),
    });

    await waitFor(() => {
      expect(opts.setMessages).toHaveBeenCalledWith([]);
    });
    expect(store.switchThread).not.toHaveBeenCalled();
  });

  it('waits while auth is loading before hydrating', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, session: null, signOut: vi.fn() });
    const store = makeThreadsStore({ loading: false });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t1'),
    });

    expect(opts.setMessages).not.toHaveBeenCalled();
    expect(store.switchThread).not.toHaveBeenCalled();
  });

  it('waits while threads are loading before hydrating', () => {
    const store = makeThreadsStore({ loading: true });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t1'),
    });

    expect(opts.setMessages).not.toHaveBeenCalled();
  });

  // ── hydratedByHandlerRef guard ────────────────────────────────────────────

  it('skips URL hydration setMessages when handler already loaded the thread', async () => {
    const thread = makeThread('t1', [makeMessage('user')]);
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    const { result } = renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat'),
    });

    // selectThread sets hydratedByHandlerRef internally
    act(() => {
      result.current.handleSelectThread('t1');
    });

    await waitFor(() => {
      expect(opts.setMessages).toHaveBeenCalledWith(thread.messages);
    });

    // The URL hydration effect should record a skip for this thread
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'hydration_skip',
      expect.objectContaining({ threadId: 't1' })
    );
  });

  // ── handleNewChat ─────────────────────────────────────────────────────────

  it('handleNewChat flushes current thread and creates a new one', async () => {
    const store = makeThreadsStore({ currentThreadId: 'old-thread' });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    const { result } = renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/old-thread'),
    });

    act(() => {
      result.current.handleNewChat();
    });

    expect(store.flushSave).toHaveBeenCalledWith('old-thread');
    expect(opts.clearMessages).toHaveBeenCalled();
    expect(store.createThread).toHaveBeenCalled();
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'flush_save',
      expect.objectContaining({ threadId: 'old-thread' })
    );
  });

  // ── handleDeleteThread ────────────────────────────────────────────────────

  it('handleDeleteThread calls deleteThread and clears messages when deleting active thread', async () => {
    const t1 = makeThread('del-me', [makeMessage('user')]);
    const store = makeThreadsStore({ threads: [t1] });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    const { result } = renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/del-me'),
    });

    act(() => {
      result.current.handleDeleteThread('del-me');
    });

    expect(store.deleteThread).toHaveBeenCalledWith('del-me');
    expect(opts.setMessages).toHaveBeenCalledWith([]);
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'thread_delete',
      expect.objectContaining({ threadId: 'del-me' })
    );
  });

  it('handleDeleteThread navigates to next thread when available', async () => {
    const t1 = makeThread('del-me');
    const t2 = makeThread('next-one', [makeMessage('assistant', 'hi')]);
    const store = makeThreadsStore({ threads: [t1, t2] });
    mockUseChatThreads.mockReturnValue(store);
    const opts = makeRuntimeOptions();

    const { result } = renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/del-me'),
    });

    act(() => {
      result.current.handleDeleteThread('del-me');
    });

    expect(store.deleteThread).toHaveBeenCalledWith('del-me');
    // Should load next thread's messages
    expect(opts.setMessages).toHaveBeenCalledWith(t2.messages);
  });

  // ── Semantic title generation ──────────────────────────────────────────────

  it('fires title generation after first assistant response', async () => {
    const thread = makeThread('t1', [], 'New chat');
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);
    mockFetchJson.mockResolvedValueOnce({ title: 'Great Session', subtitle: 'Reflection', success: true });

    const messages = [makeMessage('user', 'hello'), { ...makeMessage('assistant', 'hi there'), isStreaming: false }];
    const opts = makeRuntimeOptions(messages);

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t1'),
    });

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/conversation/threads/t1/title',
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(store.updateThread).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ title: 'Great Session', subtitle: 'Reflection' })
      );
    });

    expect(runtimeDiagnostics.record).toHaveBeenCalledWith('title_start', expect.objectContaining({ threadId: 't1' }));
    expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
      'title_complete',
      'title_t1',
      expect.objectContaining({ threadId: 't1' })
    );
  });

  it('records title_error when the title API call fails', async () => {
    const thread = makeThread('t2', [], 'New chat');
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);
    mockFetchJson.mockRejectedValueOnce(new Error('OpenAI 429'));

    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: false }];
    const opts = makeRuntimeOptions(messages);

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t2'),
    });

    await waitFor(() => {
      expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
        'title_error',
        'title_t2',
        expect.objectContaining({ threadId: 't2', meta: expect.objectContaining({ error: 'OpenAI 429' }) })
      );
    });

    // Title failure must not propagate or call updateThread with a broken title
    expect(store.updateThread).not.toHaveBeenCalledWith(
      't2',
      expect.objectContaining({ title: expect.anything() })
    );
  });

  it('skips title generation when the thread already has a non-default title', async () => {
    const thread = makeThread('t3', [makeMessage('user', 'hello')], 'Custom Title');
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);

    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: false }];
    const opts = makeRuntimeOptions(messages);

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t3'),
    });

    // Give effects time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchJson).not.toHaveBeenCalled();
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith(
      'title_skip',
      expect.objectContaining({ threadId: 't3', meta: { reason: 'already_titled' } })
    );
  });

  it('does not fire title generation while the assistant message is still streaming', async () => {
    const thread = makeThread('t4', [], 'New chat');
    const store = makeThreadsStore({ threads: [thread] });
    mockUseChatThreads.mockReturnValue(store);

    const messages = [makeMessage('user'), { ...makeMessage('assistant'), isStreaming: true }];
    const opts = makeRuntimeOptions(messages);

    renderHook(() => useConversationRuntime(opts), {
      wrapper: makeWrapper('/chat/t4'),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchJson).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { renderHook, act } from '@testing-library/react';

// ── Module mocks (mirror useChatThreads.test harness) ───────────────────────────
vi.mock('../../../../lib/supabase', () => ({ useAuth: vi.fn() }));
vi.mock('../../../../lib/api', () => ({ fetchJson: vi.fn() }));
vi.mock('../../../../services/demoChatSimulation', async (orig) => ({
  ...(await orig<typeof import('../../../../services/demoChatSimulation')>()),
  isDemoChatMockup: () => false,
  seedDemoChatThreadsIfEmpty: (threads: unknown) => threads,
}));
vi.mock('../../services/runtimeDiagnostics', () => ({
  runtimeDiagnostics: { record: vi.fn(), startTimer: vi.fn(), recordTimed: vi.fn(), exposeOnWindow: vi.fn() },
}));

import { useAuth } from '../../../../lib/supabase';
import { makeStore } from '../../../../store';
import { ChatThreadProvider, useChatThreadContext } from '../../../../contexts/ChatThreadContext';
import type { Message } from '../../message/ChatMessage';

const mockUseAuth = vi.mocked(useAuth);

function msg(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, role, content, timestamp: new Date() } as Message;
}

function renderContext() {
  const store = makeStore();
  return renderHook(() => useChatThreadContext(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <ChatThreadProvider>{children}</ChatThreadProvider>
      </Provider>
    ),
  });
}

describe('chat thread isolation (regression)', () => {
  beforeEach(() => {
    // Guest runtime → local-only cache, no backend round-trips.
    mockUseAuth.mockReturnValue({ user: null, loading: false, session: null, signOut: vi.fn() } as never);
    localStorage.clear();
  });

  it('keeps messages in the thread that owns them across create + switch (no merge)', () => {
    const { result } = renderContext();
    let threadA = '';
    let threadB = '';

    // Thread A: create, activate, write a full user+assistant turn.
    act(() => {
      threadA = result.current.createThread();
      result.current.setActiveThreadId(threadA);
      result.current.updateActiveMessages([msg('u-a', 'user', 'hello A'), msg('a-a', 'assistant', 'reply A')]);
    });

    // Thread B: create + activate + write — all in ONE tick. This is the bug
    // repro: setActiveThreadId(B) then updateActiveMessages() synchronously.
    // Before the fix, the active-thread ref still pointed at A and B's message
    // merged into A.
    act(() => {
      threadB = result.current.createThread();
      result.current.setActiveThreadId(threadB);
      result.current.updateActiveMessages([msg('u-b', 'user', 'hello B')]);
    });

    expect(threadA).not.toBe(threadB);

    // A must still hold exactly its own turn — B's message must not have leaked in.
    const a = result.current.getThread(threadA);
    expect(a?.messages.map((m) => m.id)).toEqual(['u-a', 'a-a']);

    // B holds only its own message.
    const b = result.current.getThread(threadB);
    expect(b?.messages.map((m) => m.id)).toEqual(['u-b']);
  });

  it('switching back to A shows only A messages, and assistant turns persist', () => {
    const { result } = renderContext();
    let threadA = '';
    let threadB = '';

    act(() => {
      threadA = result.current.createThread();
      result.current.setActiveThreadId(threadA);
      result.current.updateActiveMessages([msg('u-a', 'user', 'A1'), msg('a-a', 'assistant', 'A2')]);
    });
    act(() => {
      threadB = result.current.createThread();
      result.current.setActiveThreadId(threadB);
      result.current.updateActiveMessages([msg('u-b', 'user', 'B1'), msg('a-b', 'assistant', 'B2')]);
    });

    // Switch back to A.
    act(() => {
      result.current.setActiveThreadId(threadA);
    });

    expect(result.current.activeMessages.map((m) => m.id)).toEqual(['u-a', 'a-a']);
    // Assistant turn is present (didn't vanish) and isolated from B.
    expect(result.current.activeMessages.some((m) => m.role === 'assistant' && m.id === 'a-a')).toBe(true);
    expect(result.current.activeMessages.some((m) => m.id.startsWith('a-b'))).toBe(false);
  });

  it('pinned writes target a specific thread regardless of which thread is active', () => {
    const { result } = renderContext();
    let threadA = '';
    let threadB = '';

    act(() => {
      threadA = result.current.createThread();
      result.current.setActiveThreadId(threadA);
      result.current.updateActiveMessages([msg('u-a', 'user', 'A')]);
    });
    act(() => {
      threadB = result.current.createThread();
      result.current.setActiveThreadId(threadB);
    });

    // Active thread is B, but we pin a write to A (mirrors an in-flight stream
    // completing after the user switched threads).
    act(() => {
      result.current.mutateThreadMessagesForThread(threadA, (prev) => [...prev, msg('a-a', 'assistant', 'late reply')]);
    });

    expect(result.current.getThread(threadA)?.messages.map((m) => m.id)).toEqual(['u-a', 'a-a']);
    expect(result.current.getThread(threadB)?.messages ?? []).toHaveLength(0);
  });
});

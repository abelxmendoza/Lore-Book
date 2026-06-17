import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../../../../lib/supabase', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

// runtimeDiagnostics is a side-effect singleton; stub it to keep tests quiet
vi.mock('../../services/runtimeDiagnostics', () => ({
  runtimeDiagnostics: {
    record: vi.fn(),
    startTimer: vi.fn(),
    recordTimed: vi.fn(),
    exposeOnWindow: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { useAuth } from '../../../../lib/supabase';
import { fetchJson } from '../../../../lib/api';
import { useChatThreads } from '../useChatThreads';
import { runtimeDiagnostics } from '../../services/runtimeDiagnostics';

const mockUseAuth = vi.mocked(useAuth);
const mockFetchJson = vi.mocked(fetchJson);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAuthState(opts: { userId?: string; loading?: boolean } = {}) {
  return {
    user: opts.userId ? ({ id: opts.userId } as any) : null,
    loading: opts.loading ?? false,
    session: null,
    signOut: vi.fn(),
  };
}

function makeDbThread(id: string, title = 'Test thread', messages: any[] = []) {
  return {
    id,
    title,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    metadata: { messages },
  };
}

function makeMessage(id = 'm1', content = 'hi') {
  return { id, role: 'user', content, timestamp: new Date().toISOString() };
}

// Threads with messages survive the stale-empty filter regardless of age;
// empty threads survive only if updatedAt is recent.
function makeStoredThread(id: string, title: string, messages: any[] = [makeMessage()]) {
  return { id, title, messages, updatedAt: new Date(0).toISOString() };
}

function mockBackendThreadLoad(threads: ReturnType<typeof makeDbThread>[]) {
  mockFetchJson.mockResolvedValueOnce({ threads, success: true });
  mockFetchJson.mockResolvedValue({ success: true, recovered: 0 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useChatThreads', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuthState());
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Auth loading gate ────────────────────────────────────────────────────────

  it('stays in loading state while auth is resolving', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ loading: true }));
    const { result } = renderHook(() => useChatThreads());
    expect(result.current.threadsLoading).toBe(true);
    expect(mockFetchJson).not.toHaveBeenCalled();
  });

  // ── Guest / localStorage path ─────────────────────────────────────────────

  it('loads threads from localStorage when not authenticated', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const stored = [makeStoredThread('thread-1', 'Old thread')];
    localStorage.setItem('lorekeeper_chat_threads_guest', JSON.stringify(stored));

    const { result } = renderHook(() => useChatThreads());

    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe('thread-1');
    expect(mockFetchJson).not.toHaveBeenCalled();
  });

  it('filters out stale empty threads on load but keeps threads with messages', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const stored = [
      makeStoredThread('stale-empty', 'Stale', []),       // no messages + epoch updatedAt → dropped
      makeStoredThread('has-messages', 'Keep me'),        // has a message → kept regardless of age
    ];
    localStorage.setItem('lorekeeper_chat_threads_guest', JSON.stringify(stored));

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe('has-messages');
  });

  it('starts with empty threads when localStorage is empty and not authenticated', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const { result } = renderHook(() => useChatThreads());

    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    expect(result.current.threads).toHaveLength(0);
  });

  // ── Authenticated / backend path ──────────────────────────────────────────

  it('loads threads from backend when authenticated', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    mockBackendThreadLoad([
      makeDbThread('thread-a', 'Thread A'),
      makeDbThread('thread-b', 'Thread B'),
    ]);

    const { result } = renderHook(() => useChatThreads());

    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    expect(result.current.threads).toHaveLength(2);
    expect(result.current.threads[0].id).toBe('thread-a');
    expect(result.current.threadsReady).toBe(true);
    expect(runtimeDiagnostics.record).toHaveBeenCalledWith('backend_load_start');
    expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
      'backend_load_complete',
      'backend_load',
      expect.objectContaining({ meta: { threadCount: 2 } })
    );
  });

  it('falls back to localStorage when backend load fails', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    const stored = [makeStoredThread('local-1', 'Local thread')];
    localStorage.setItem('lorekeeper_chat_threads_user-1', JSON.stringify(stored));
    mockFetchJson.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useChatThreads());

    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe('local-1');
    expect(result.current.threadsReady).toBe(false); // backend never confirmed
    expect(runtimeDiagnostics.recordTimed).toHaveBeenCalledWith(
      'backend_load_fallback',
      'backend_load',
      expect.objectContaining({ meta: expect.objectContaining({ error: 'Network error' }) })
    );
  });

  it('deserialises message timestamps from strings to Date objects (guest localStorage)', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const ts = '2025-01-01T00:00:00.000Z';
    localStorage.setItem(
      'lorekeeper_chat_threads_guest',
      JSON.stringify([makeStoredThread('t1', 'Thread', [{ id: 'm1', role: 'user', content: 'hi', timestamp: ts }])])
    );

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    const msg = result.current.threads[0].messages[0];
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect((msg.timestamp as Date).toISOString()).toBe(ts);
  });

  // ── createThread ─────────────────────────────────────────────────────────

  it('creates a new thread locally when not authenticated', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let newId: string;
    act(() => {
      newId = result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].id).toBe(newId!);
    expect(result.current.threads[0].title).toBe('Draft');
    expect(result.current.currentThreadId).toBe(newId!);
    expect(mockFetchJson).not.toHaveBeenCalled();
  });

  it('reuses the most recent empty thread instead of creating a new one', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let firstId: string;
    act(() => {
      firstId = result.current.createThread();
    });

    let secondId: string;
    act(() => {
      secondId = result.current.createThread();
    });

    expect(secondId!).toBe(firstId!);
    expect(result.current.threads).toHaveLength(1);
  });

  it('creates a thread via backend when authenticated', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    mockBackendThreadLoad([]);

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    act(() => {
      result.current.createThread();
    });

    await waitFor(() =>
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/conversation/threads',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  // ── deleteThread ─────────────────────────────────────────────────────────

  it('removes thread from state on deleteThread', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const stored = [makeStoredThread('del-1', 'Delete me')];
    localStorage.setItem('lorekeeper_chat_threads_guest', JSON.stringify(stored));

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      result.current.deleteThread('del-1');
    });

    expect(result.current.threads).toHaveLength(0);
  });

  it('deleteThread removes thread after local message update', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    mockFetchJson.mockResolvedValue({ threads: [], success: true });

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let id: string;
    act(() => {
      id = result.current.createThread();
    });

    act(() => {
      result.current.updateThread(id!, { messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: new Date() }] });
    });

    act(() => {
      result.current.deleteThread(id!);
    });

    expect(result.current.threads.find((t) => t.id === id!)).toBeUndefined();
  });

  it('updateThread with touchActivity PATCHes activity only (no messages)', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    mockFetchJson.mockResolvedValue({ threads: [], success: true });

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let id: string;
    act(() => {
      id = result.current.createThread();
    });

    mockFetchJson.mockClear();

    act(() => {
      result.current.updateThread(id!, {
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: new Date() }],
        touchActivity: true,
      });
    });

    await waitFor(() =>
      expect(mockFetchJson).toHaveBeenCalledWith(
        `/api/conversation/threads/${id!}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ touchActivity: true }),
        })
      )
    );

    const patchCalls = mockFetchJson.mock.calls.filter(
      (c) => c[0] === `/api/conversation/threads/${id!}` && (c[1] as any)?.method === 'PATCH'
    );
    expect(patchCalls.every((c) => !(c[1] as any).body.includes('"messages"'))).toBe(true);
  });

  it('flushSave is a no-op after P2 (messages persist via chat_messages)', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let id: string;
    act(() => {
      id = result.current.createThread();
    });

    act(() => {
      result.current.updateThread(id!, { messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: new Date() }] });
      result.current.flushSave(id!);
    });

    expect(mockFetchJson).not.toHaveBeenCalled();
  });

  // ── updateThread + local persistence ──────────────────────────────────────

  it('persists updated threads to localStorage for guest users', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsLoading).toBe(false));

    let id: string;
    act(() => {
      id = result.current.createThread();
    });
    act(() => {
      result.current.updateThread(id!, { title: 'My Thread' });
    });

    const raw = localStorage.getItem('lorekeeper_chat_threads_guest');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.some((t: any) => t.title === 'My Thread')).toBe(true);
  });

  // ── renameThread ─────────────────────────────────────────────────────────

  it('renameThread updates local state optimistically', async () => {
    mockUseAuth.mockReturnValue(makeAuthState());
    const stored = [makeStoredThread('r1', 'Old Name')];
    localStorage.setItem('lorekeeper_chat_threads_guest', JSON.stringify(stored));

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      result.current.renameThread('r1', 'New Name');
    });

    expect(result.current.threads[0].title).toBe('New Name');
  });

  // ── getThread ─────────────────────────────────────────────────────────────

  it('getThread returns the correct thread by id', async () => {
    mockUseAuth.mockReturnValue(makeAuthState({ userId: 'user-1' }));
    mockBackendThreadLoad([makeDbThread('find-me', 'Found')]);

    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.threadsReady).toBe(true));

    expect(result.current.getThread('find-me')?.title).toBe('Found');
    expect(result.current.getThread('not-there')).toBeUndefined();
  });
});

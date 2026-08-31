import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();
const mockCooldownRemaining = vi.fn(() => 0);

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: 'thread-chat-1' }),
}));

// Real (non-simulated) chat path; demo simulation defaults ON under vitest.
vi.mock('../../../../services/demoChatSimulation', async (orig) => ({
  ...(await orig<typeof import('../../../../services/demoChatSimulation')>()),
  isSimulatedChatRuntime: () => false,
  isDemoChatMockup: () => false,
  seedDemoChatThreadsIfEmpty: (threads: unknown) => threads,
}));

vi.mock('../../../../contexts/ChatThreadContext', () => ({
  useChatThreadContext: () => ({
    createThread: vi.fn(() => 'new-thread'),
    setActiveThreadId: vi.fn(),
    getThread: mockGetThread,
    mutateThreadMessagesForThread: mockMutateThreadMessagesForThread,
    hydrateThreadMessages: mockHydrateThreadMessages,
    updateActiveMessages: mockUpdateActiveMessages,
    activeMessages: [],
    clearActiveMessages: vi.fn(),
  }),
}));

vi.mock('../../../../hooks/useChatStream', () => ({
  useChatStream: () => ({
    streamChat: mockStreamChat,
    isStreaming: false,
  }),
}));

vi.mock('../../../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({
    refreshEntries: vi.fn(),
    refreshTimeline: vi.fn(),
    refreshChapters: vi.fn(),
  }),
}));

vi.mock('../../../../contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    canSendChatMessage: true,
    incrementChatMessage: vi.fn(),
    guestState: {},
  }),
}));

vi.mock('../../../../contexts/CurrentContextContext', () => ({
  useCurrentContext: () => ({ currentContext: { kind: 'none' } }),
}));

vi.mock('../../../../contexts/SoulProfileChatContext', () => ({
  useSoulProfileChatContextOptional: () => null,
}));

vi.mock('../../../../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => false,
}));

vi.mock('../../../../lib/supabase', () => ({
  useAuth: () => ({ user: { id: 'user-chat-1' } }),
}));

vi.mock('../../../../lib/monitoring', () => ({
  analytics: { track: vi.fn() },
}));

vi.mock('../../../../utils/chatCommands', () => ({
  parseSlashCommand: () => null,
  handleSlashCommand: vi.fn(),
}));

vi.mock('../../../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ mood: 0 }),
}));

vi.mock('../../../../lib/chatSendRateLimit', async (orig) => ({
  ...(await orig<typeof import('../../../../lib/chatSendRateLimit')>()),
  chatSendCooldownRemainingSec: (...args: unknown[]) => mockCooldownRemaining(...args),
}));

import { useChat } from '../useChat';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '../../../../store';
import type { Message } from '../../message/ChatMessage';
import {
  latestRecoverableStory,
  preserveStoryAttempt,
  requestStoryRecovery,
  type StorySafetyAttempt,
  resetStorySafetyVaultForTests,
} from '../../services/storySafetyVault';

// useChat uses useAppDispatch, so it must render inside a Redux Provider.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store: makeStore() }, children);

describe('useChat — assistant bubble durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorySafetyVaultForTests();
    mockHydrateThreadMessages.mockResolvedValue({ id: 'thread-chat-1', messages: [] } as never);
    mockGetThread.mockReturnValue({ id: 'thread-chat-1', messages: [] });
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: unknown[]) => unknown[]) => {
        const prev: unknown[] = [];
        updater(prev);
      }
    );
    mockCooldownRemaining.mockReturnValue(0);
  });

  it('does not clear a failed attempt when an older identical message exists', async () => {
    const attempt: StorySafetyAttempt = {
      id: 'attempt-repeated-text',
      ownerId: 'user-chat-1',
      threadId: 'thread-chat-1',
      text: 'same text sent twice',
      createdAt: new Date('2026-08-30T15:00:00.000Z').toISOString(),
    };
    preserveStoryAttempt(attempt);
    // Simulate a page reload: the in-memory in-flight marker is gone while
    // the local vault entry remains available for recovery.
    requestStoryRecovery(attempt);

    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: Message[]) => Message[]) => {
        updater([
          {
            id: 'older-success',
            role: 'user',
            content: attempt.text,
            timestamp: new Date('2026-08-29T15:00:00.000Z'),
            persistStatus: 'saved',
          },
        ]);
      },
    );

    renderHook(() => useChat(), { wrapper });

    await waitFor(() => {
      expect(latestRecoverableStory('user-chat-1', 'thread-chat-1')).not.toBeNull();
    });
  });

  it('reconciles assistant id from stream metadata and hydrates after complete', async () => {
    let onMetadata: ((meta: unknown) => void) | undefined;
    let onComplete: (() => void) | undefined;

    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        onMeta: (meta: unknown) => void,
        onDone: () => void
      ) => {
        onMetadata = onMeta;
        onComplete = onDone;
        onMeta({ messageId: 'db-user-1', assistantMessageId: 'db-asst-1', sessionId: 'thread-chat-1' });
        onDone();
      }
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Hello durability');
    });

    // User + assistant bubbles are written pinned to the send-time thread
    // (mutateThreadMessagesForThread), not via the active-thread adapter.
    expect(onMetadata).toBeDefined();
    expect(onComplete).toBeDefined();
    expect(mockMutateThreadMessagesForThread).toHaveBeenCalled();

    await waitFor(
      () => {
        expect(mockHydrateThreadMessages).toHaveBeenCalledWith('thread-chat-1');
      },
      { timeout: 2000 }
    );
    expect(latestRecoverableStory('user-chat-1', 'thread-chat-1')).toBeNull();
  });

  it('keeps assistant bubble on outer catch instead of removing it', async () => {
    mockStreamChat.mockRejectedValue(new Error('Stream exploded'));

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('This should not vanish');
    });

    expect(latestRecoverableStory('user-chat-1', 'thread-chat-1')?.text).toBe('This should not vanish');

    expect(mockMutateThreadMessagesForThread).toHaveBeenCalled();
    const removeCalls = mockUpdateActiveMessages.mock.calls.filter((call) => {
      const updater = call[0];
      if (typeof updater !== 'function') return false;
      const next = updater([{ id: 'a', role: 'assistant', content: 'x' }]);
      return Array.isArray(next) && next.length === 0;
    });
    expect(removeCalls).toHaveLength(0);
  });

  it('shows reply failure even when memory ingestion remains queued', async () => {
    let threadMessages: Message[] = [];
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: Message[]) => Message[]) => {
        threadMessages = updater(threadMessages);
      },
    );
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        onMeta: (meta: unknown) => void,
        _onDone: unknown,
        onError: (error: string, durability: unknown) => void,
      ) => {
        onMeta({ messageId: 'db-user-queued', sessionId: 'thread-chat-1' });
        onError(
          'Model provider unavailable',
          {
            userMessage: { persisted: true, id: 'db-user-queued' },
            assistantResponse: { status: 'failed' },
            ingestion: { status: 'QUEUED', jobId: 'job-queued' },
          },
          {
            code: 'openai_circuit_open',
            stage: 'response_generation',
            errorCategory: 'quota',
            noticeCode: 'message_saved_assistant_failed',
          },
        );
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Save this even if the reply fails');
    });

    const userMessage = threadMessages.find((message) => message.role === 'user');
    const deliveryNotice = threadMessages.find((message) => message.isDeliveryNotice === true);
    expect(userMessage?.lifecycle).toMatchObject({
      cloudPersistence: 'saved',
      processing: 'failed',
      lastError: { stage: 'generation', code: 'openai_circuit_open' },
    });
    expect(userMessage?.metadata?.ingestionStatus).toBe('QUEUED');
    expect(userMessage?.metadata?.generationFailure).toMatchObject({
      code: 'openai_circuit_open',
      stage: 'response_generation',
      errorCategory: 'quota',
    });
    expect(deliveryNotice?.lifecycle).toMatchObject({
      cloudPersistence: 'saved',
      processing: 'failed',
    });
  });

  it('finalizes a backgrounded stream through its send-time thread id', async () => {
    mockStreamChat.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      void result.current.sendMessage('Keep this stream isolated');
    });
    await waitFor(() => expect(mockMutateThreadMessagesForThread.mock.calls.length).toBeGreaterThanOrEqual(2));
    const callsBeforeHide = mockMutateThreadMessagesForThread.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockMutateThreadMessagesForThread.mock.calls.length).toBe(callsBeforeHide + 1);
    expect(mockMutateThreadMessagesForThread.mock.calls.at(-1)?.[0]).toBe('thread-chat-1');
    expect(mockUpdateActiveMessages).not.toHaveBeenCalled();
  });

  it('rejects a second send while the first stream is still in flight', async () => {
    mockStreamChat.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      void result.current.sendMessage('first turn');
    });
    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.sendMessage('second turn');
    });

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });

  it('pins a send cooldown notice to the originating URL thread', async () => {
    mockCooldownRemaining.mockReturnValue(12);
    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Do not leak this notice');
    });

    expect(mockMutateThreadMessagesForThread).toHaveBeenCalledWith(
      'thread-chat-1',
      expect.any(Function),
    );
    expect(mockUpdateActiveMessages).not.toHaveBeenCalled();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });
});

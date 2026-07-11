import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();

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

import { useChat } from '../useChat';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '../../../../store';
import {
  latestRecoverableStory,
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
});

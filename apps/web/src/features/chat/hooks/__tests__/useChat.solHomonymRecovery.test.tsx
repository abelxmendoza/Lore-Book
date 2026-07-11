/**
 * Frontend recovery must distinguish:
 *   - save failed → restore composer
 *   - save succeeded, assistant failed → keep bubble, do NOT restore as unsent
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: 'thread-sol-1' }),
}));

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
  useAuth: () => ({ user: { id: 'user-sol-1' } }),
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
import { makeStore } from '../../../../store';
import {
  latestRecoverableStory,
  resetStorySafetyVaultForTests,
} from '../../services/storySafetyVault';

const FIXTURE =
  "so i've been working on Lorebook a lot lately and have been making it with the release of Claude Fable 5, Opus 4.8, Cursor Composer 2.5, Codex Chatgpt 5.5 and now with the release of 5.6 Sol which just so happens to be the same name as one of my most recent lovers which is funny because the names of the models match my name Abel and the girl i was fucking Sol's name. Fable and Sol which is hilarious and funny. I feel like Sam Altman is playing a joke on me.";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store: makeStore() }, children);

describe('useChat — Sol fixture composer recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorySafetyVaultForTests();
    mockHydrateThreadMessages.mockResolvedValue({ id: 'thread-sol-1', messages: [] } as never);
    mockGetThread.mockReturnValue({ id: 'thread-sol-1', messages: [] });
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: unknown[]) => unknown[]) => {
        updater([]);
      },
    );
  });

  it('does NOT restore composer when durability says the message was saved', async () => {
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        _onMeta: unknown,
        _onDone: unknown,
        onError: (error: string, durability?: unknown) => void,
      ) => {
        onError('assistant failed', {
          userMessage: { id: 'db-msg-1', persisted: true },
          assistantResponse: { status: 'failed', errorCategory: 'rate_limit' },
          ingestion: { jobId: 'job-1', status: 'QUEUED' },
        });
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.sendMessage(FIXTURE);
    });

    expect(latestRecoverableStory('user-sol-1', 'thread-sol-1')).toBeNull();

    // Saved path keeps the vault clear — do not treat the send as unsaved.
    const failedPersistUpdates = mockMutateThreadMessagesForThread.mock.calls.some((call) => {
      const updater = call[1];
      if (typeof updater !== 'function') return false;
      const next = updater([
        { id: 'user-1', role: 'user', content: FIXTURE, persistStatus: 'pending', metadata: {} },
      ]) as Array<{ persistStatus?: string }>;
      return next.some((m) => m.persistStatus === 'failed');
    });
    expect(failedPersistUpdates).toBe(false);
  });

  it('DOES restore composer when save truly failed', async () => {
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        _onMeta: unknown,
        _onDone: unknown,
        onError: (error: string, durability?: unknown) => void,
      ) => {
        onError('persist failed', {
          userMessage: { persisted: false },
          assistantResponse: { status: 'failed' },
          ingestion: { status: 'NOT_SCHEDULED' },
        });
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.sendMessage(FIXTURE);
    });

    expect(latestRecoverableStory('user-sol-1', 'thread-sol-1')?.text).toBe(FIXTURE);
  });
});

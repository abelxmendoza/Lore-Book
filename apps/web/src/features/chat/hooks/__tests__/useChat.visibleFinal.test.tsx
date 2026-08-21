import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();

let messageState: Array<Record<string, unknown>> = [];

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: 'thread-visible-1' }),
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
  useAuth: () => ({ user: { id: 'user-visible-1' } }),
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

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store: makeStore() }, children);

describe('useChat — visible response converges with summary discipline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageState = [];
    mockHydrateThreadMessages.mockResolvedValue({ id: 'thread-visible-1', messages: [] } as never);
    mockGetThread.mockReturnValue({ id: 'thread-visible-1', messages: [] });
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: unknown[]) => unknown[]) => {
        messageState = updater(messageState as never) as Array<Record<string, unknown>>;
      },
    );
  });

  it('replaces the streamed draft on the same assistant message when rewritten', async () => {
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        onChunk: (chunk: string) => void,
        onMeta: (meta: unknown) => void,
        onDone: (result?: { rewritten?: boolean; finalContent?: string }) => void,
      ) => {
        onChunk('Maya was jealous.');
        onMeta({ messageId: 'db-user-1', assistantMessageId: 'db-asst-1', sessionId: 'thread-visible-1' });
        onDone({
          rewritten: true,
          finalContent: 'The user believed jealousy or territoriality may also have been involved.',
        });
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('I think Maya was jealous.');
    });

    const assistants = messageState.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe(
      'The user believed jealousy or territoriality may also have been involved.',
    );
    expect(assistants[0].isStreaming).toBe(false);
    expect(assistants[0].id).toBe('db-asst-1');
  });

  it('keeps the streamed draft when verification is a no-op', async () => {
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        onChunk: (chunk: string) => void,
        onMeta: (meta: unknown) => void,
        onDone: (result?: { rewritten?: boolean }) => void,
      ) => {
        onChunk('Maya said she felt uncomfortable.');
        onMeta({ messageId: 'db-user-2', assistantMessageId: 'db-asst-2', sessionId: 'thread-visible-1' });
        onDone({ rewritten: false });
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Maya said she felt uncomfortable.');
    });

    const assistants = messageState.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe('Maya said she felt uncomfortable.');
  });
});

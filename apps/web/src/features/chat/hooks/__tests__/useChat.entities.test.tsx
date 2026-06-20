import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();

let assistantMessageId = '';
let messageState: Array<Record<string, unknown>> = [];

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: 'thread-entities-1' }),
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
  useAuth: () => ({ user: { id: 'user-entities-1' } }),
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

// useChat uses useAppDispatch, so it must render inside a Redux Provider.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store: makeStore() }, children);

const mentionedEntities = [
  { id: 'c1', name: 'Tía Maria', type: 'character' as const },
  { id: 'l1', name: 'San Diego', type: 'location' as const },
];

function findMentionedEntitiesFromMutations(): unknown {
  for (const [, updater] of mockMutateThreadMessagesForThread.mock.calls) {
    const prev = [
      { id: 'user-local', role: 'user', content: 'I visited Tía Maria in San Diego.' },
      { id: assistantMessageId, role: 'assistant', content: 'reply', isStreaming: true },
    ];
    const next = (updater as (p: unknown[]) => unknown[])(prev);
    const assistant = (next as Array<Record<string, unknown>>).find(
      (m) => m.role === 'assistant' && m.mentionedEntities
    );
    if (assistant?.mentionedEntities) return assistant.mentionedEntities;
  }
  return undefined;
}

describe('useChat — entity chips from stream metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantMessageId = '';
    messageState = [];
    mockHydrateThreadMessages.mockResolvedValue({ id: 'thread-entities-1', messages: [] } as never);
    mockGetThread.mockReturnValue({ id: 'thread-entities-1', messages: [] });
    mockUpdateActiveMessages.mockImplementation((updater: (prev: unknown[]) => unknown[]) => {
      messageState = updater(messageState) as Array<Record<string, unknown>>;
      const assistant = messageState.find((m) => m.role === 'assistant' && m.isStreaming);
      if (assistant?.id) assistantMessageId = String(assistant.id);
    });
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: unknown[]) => unknown[]) => {
        updater(messageState as never);
      }
    );
  });

  it('attaches mentionedEntities to the assistant bubble when stream metadata includes them', async () => {
    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        onMeta: (meta: unknown) => void,
        onDone: () => void
      ) => {
        onMeta({
          messageId: 'db-user-1',
          assistantMessageId: 'db-asst-1',
          sessionId: 'thread-entities-1',
          mentionedEntities,
        });
        onDone();
      }
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('I visited Tía Maria in San Diego.');
    });

    expect(mockStreamChat).toHaveBeenCalled();
    expect(assistantMessageId).toBeTruthy();
    expect(findMentionedEntitiesFromMutations()).toEqual(mentionedEntities);
  });

  it('forwards composerEntities to streamChat when provided', async () => {
    const composerEntities = [
      {
        id: 'uuid-abel',
        name: 'Abel',
        type: 'character' as const,
        aliases: [],
        mentionKeys: ['abel'],
        status: 'confirmed' as const,
        matchedLabel: 'Abel',
      },
    ];

    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        onMeta: (meta: unknown) => void,
        onDone: () => void
      ) => {
        onMeta({ messageId: 'db-user-2', assistantMessageId: 'db-asst-2', sessionId: 'thread-entities-1' });
        onDone();
      }
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Tell me about Abel.', { composerEntities });
    });

    expect(mockStreamChat.mock.calls[0]?.[12]).toEqual(composerEntities);
  });
});

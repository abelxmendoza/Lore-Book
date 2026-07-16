import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '../../../../store';
import {
  preserveStoryAttempt,
  resetStorySafetyVaultForTests,
} from '../../services/storySafetyVault';
import type { Message } from '../../message/ChatMessage';

const mockStreamChat = vi.fn();
const mockMutateThreadMessagesForThread = vi.fn();
const mockHydrateThreadMessages = vi.fn();
const mockGetThread = vi.fn();
const mockUpdateActiveMessages = vi.fn();

let threadMessages: Message[] = [];

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ threadId: 'thread-retry-1' }),
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
  useAuth: () => ({ user: { id: 'user-retry-1' } }),
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

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(Provider, { store: makeStore(), children });

describe('useChat — retry actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorySafetyVaultForTests();
    threadMessages = [];
    mockHydrateThreadMessages.mockResolvedValue({ id: 'thread-retry-1', messages: [] } as never);
    mockGetThread.mockImplementation(() => ({ id: 'thread-retry-1', messages: threadMessages }));
    mockMutateThreadMessagesForThread.mockImplementation(
      (_threadId: string, updater: (prev: Message[]) => Message[]) => {
        threadMessages = updater(threadMessages);
      },
    );
  });

  it('retry cloud sync reuses clientIdempotencyKey and does not append another user message', async () => {
    const key = 'idem-key-retry-1';
    preserveStoryAttempt({
      id: key,
      ownerId: 'user-retry-1',
      threadId: 'thread-retry-1',
      text: 'Exact raw story text',
      createdAt: '2026-07-15T00:00:00.000Z',
    });

    threadMessages = [
      {
        id: 'user-local-1',
        role: 'user',
        content: 'Exact raw story text',
        timestamp: new Date('2026-07-15T00:00:00.000Z'),
        persistStatus: 'failed',
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'failed',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: '2026-07-15T00:00:00.000Z',
          lastError: {
            stage: 'cloud',
            message: 'timeout',
            retryable: true,
            occurredAt: '2026-07-15T00:00:00.000Z',
          },
        },
        metadata: { clientIdempotencyKey: key },
      },
      {
        id: 'notice-1',
        role: 'assistant',
        content: 'Cloud sync failed',
        timestamp: new Date(),
        isDeliveryNotice: true,
        persistStatus: 'failed',
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'failed',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: '2026-07-15T00:00:00.000Z',
          lastError: {
            stage: 'cloud',
            message: 'timeout',
            retryable: true,
            occurredAt: '2026-07-15T00:00:00.000Z',
          },
        },
        metadata: {
          clientIdempotencyKey: key,
          relatedUserMessageId: 'user-local-1',
          originalUserText: 'Exact raw story text',
        },
      },
    ];

    mockStreamChat.mockImplementation(
      async (
        _msg: string,
        _history: unknown[],
        _onChunk: unknown,
        onMeta: (meta: unknown) => void,
        onDone: () => void,
        ...rest: unknown[]
      ) => {
        const idemKey = rest[rest.length - 1];
        expect(idemKey).toBe(key);
        onMeta({ messageId: 'db-user-1', assistantMessageId: 'db-asst-1', sessionId: 'thread-retry-1' });
        onDone();
      },
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    const userCountBefore = threadMessages.filter((m) => m.role === 'user').length;

    await act(async () => {
      await result.current.retryCloudSync('notice-1');
    });

    const userMsgs = threadMessages.filter((m) => m.role === 'user');
    expect(userMsgs).toHaveLength(userCountBefore);
    expect(userMsgs[0]?.metadata?.clientIdempotencyKey).toBe(key);
    expect(userMsgs[0]?.lifecycle?.retryCount).toBeGreaterThanOrEqual(1);
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });

  it('retry assistant response does not create another user message', async () => {
    const key = 'idem-key-retry-2';
    threadMessages = [
      {
        id: 'user-saved-1',
        role: 'user',
        content: 'Saved already',
        timestamp: new Date(),
        persistStatus: 'saved',
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'saved',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: new Date().toISOString(),
          lastError: {
            stage: 'generation',
            message: 'gen failed',
            retryable: true,
            occurredAt: new Date().toISOString(),
          },
        },
        metadata: { clientIdempotencyKey: key },
      },
      {
        id: 'notice-gen',
        role: 'assistant',
        content: 'Reply failed',
        timestamp: new Date(),
        isDeliveryNotice: true,
        persistStatus: 'failed',
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'saved',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: new Date().toISOString(),
          lastError: {
            stage: 'generation',
            message: 'gen failed',
            retryable: true,
            occurredAt: new Date().toISOString(),
          },
        },
        metadata: {
          clientIdempotencyKey: key,
          relatedUserMessageId: 'user-saved-1',
          originalUserText: 'Saved already',
        },
      },
    ];

    mockStreamChat.mockImplementation(async (_m, _h, _c, onMeta: (m: unknown) => void, onDone: () => void) => {
      onMeta({ messageId: 'user-saved-1', assistantMessageId: 'db-asst-2' });
      onDone();
    });

    const { result } = renderHook(() => useChat(), { wrapper });
    const before = threadMessages.filter((m) => m.role === 'user').length;

    await act(async () => {
      await result.current.retryAssistantResponse('notice-gen');
    });

    expect(threadMessages.filter((m) => m.role === 'user')).toHaveLength(before);
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate retry clicks while in flight', async () => {
    const key = 'idem-key-inflight';
    threadMessages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'pending',
        timestamp: new Date(),
        persistStatus: 'failed',
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'failed',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: new Date().toISOString(),
        },
        metadata: { clientIdempotencyKey: key },
      },
      {
        id: 'notice-1',
        role: 'assistant',
        content: 'fail',
        timestamp: new Date(),
        isDeliveryNotice: true,
        lifecycle: {
          localPersistence: 'saved',
          cloudPersistence: 'failed',
          processing: 'failed',
          summary: 'not_requested',
          retryCount: 0,
          updatedAt: new Date().toISOString(),
          lastError: {
            stage: 'cloud',
            message: 'x',
            retryable: true,
            occurredAt: new Date().toISOString(),
          },
        },
        metadata: {
          clientIdempotencyKey: key,
          relatedUserMessageId: 'user-1',
          originalUserText: 'pending',
        },
      },
    ];

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockStreamChat.mockImplementation(async () => {
      await gate;
    });

    const { result } = renderHook(() => useChat(), { wrapper });

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.retryCloudSync('notice-1');
    });
    await act(async () => {
      await result.current.retryCloudSync('notice-1');
    });
    release();
    await act(async () => {
      await first;
    });

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });
});

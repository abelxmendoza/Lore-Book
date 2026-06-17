/**
 * ChatThreadProvider — single canonical chat-thread cache for the app.
 *
 * Owns one useChatThreads() instance. All chat UI reads/writes thread list,
 * per-thread messages, and ordering through this context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useChatThreads, type ChatThread } from '../features/chat/hooks/useChatThreads';
import type { Message } from '../features/chat/message/ChatMessage';

type UpdateActiveMessagesOptions = {
  touchActivity?: boolean;
};

export type ChatThreadContextValue = ReturnType<typeof useChatThreads> & {
  /** Thread currently displayed in the chat UI (URL-driven). */
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  /** Messages for the active thread — derived from the canonical cache. */
  activeMessages: Message[];
  /** Update messages for the active thread (single write path). */
  updateActiveMessages: (
    updater: Message[] | ((prev: Message[]) => Message[]),
    opts?: UpdateActiveMessagesOptions
  ) => void;
  /** Update messages for any thread (pin in-flight streams to send-time thread). */
  mutateThreadMessagesForThread: (
    threadId: string,
    updater: (prev: Message[]) => Message[],
    opts?: UpdateActiveMessagesOptions
  ) => void;
};

const ChatThreadContext = createContext<ChatThreadContextValue | null>(null);

export function ChatThreadProvider({ children }: { children: ReactNode }) {
  const threadApi = useChatThreads();
  const activeThreadIdRef = useRef<string | null>(null);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);

  const setActiveThreadId = useCallback((id: string | null) => {
    activeThreadIdRef.current = id;
    setActiveThreadIdState(id);
  }, []);

  const activeMessages = useMemo(() => {
    if (!activeThreadId) return [];
    return threadApi.getThread(activeThreadId)?.messages ?? [];
  }, [activeThreadId, threadApi, threadApi.threads]);

  const updateActiveMessages = useCallback(
    (
      updater: Message[] | ((prev: Message[]) => Message[]),
      opts?: UpdateActiveMessagesOptions
    ) => {
      const id = activeThreadIdRef.current;
      if (!id) return;
      threadApi.mutateThreadMessages(
        id,
        (prev) => (typeof updater === 'function' ? updater(prev) : updater),
        opts
      );
    },
    [threadApi]
  );

  const mutateThreadMessagesForThread = useCallback(
    (
      threadId: string,
      updater: (prev: Message[]) => Message[],
      opts?: UpdateActiveMessagesOptions
    ) => {
      threadApi.mutateThreadMessages(
        threadId,
        (prev) => updater(prev),
        opts
      );
    },
    [threadApi]
  );

  const clearActiveMessages = useCallback(() => {
    const id = activeThreadIdRef.current;
    if (!id) return;
    threadApi.updateThread(id, { messages: [] });
  }, [threadApi]);

  const value = useMemo(
    (): ChatThreadContextValue => ({
      ...threadApi,
      activeThreadId,
      setActiveThreadId,
      activeMessages,
      updateActiveMessages,
      mutateThreadMessagesForThread,
      clearActiveMessages,
    }),
    [threadApi, activeThreadId, setActiveThreadId, activeMessages, updateActiveMessages, mutateThreadMessagesForThread, clearActiveMessages]
  );

  return <ChatThreadContext.Provider value={value}>{children}</ChatThreadContext.Provider>;
}

export function useChatThreadContext(): ChatThreadContextValue {
  const ctx = useContext(ChatThreadContext);
  if (!ctx) {
    throw new Error('useChatThreadContext must be used within ChatThreadProvider');
  }
  return ctx;
}

/** Recent threads slice from the canonical cache — no independent fetch. */
export function useRecentChatThreads(limit = 3): Pick<ChatThread, 'id' | 'title' | 'updatedAt'>[] {
  const { threads } = useChatThreadContext();
  return useMemo(
    () => threads.slice(0, limit).map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt })),
    [threads, limit]
  );
}

/** Active thread messages for cross-page consumers (e.g. character extraction). */
export function useActiveChatMessages(): Message[] {
  const { activeMessages } = useChatThreadContext();
  return activeMessages;
}

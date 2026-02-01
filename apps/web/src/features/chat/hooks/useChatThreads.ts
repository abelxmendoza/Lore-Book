import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../../lib/supabase';
import type { Message } from '../message/ChatMessage';

export type ChatThread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};

const STORAGE_PREFIX = 'lorekeeper_chat_threads_';
const LAST_THREAD_KEY = 'lorekeeper_chat_last_thread_';

function parseStoredMessage(msg: any): Message {
  return {
    ...msg,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
  };
}

function getStorageKey(userId: string | undefined): string {
  return `${STORAGE_PREFIX}${userId ?? 'guest'}`;
}

function getLastThreadKey(userId: string | undefined): string {
  return `${LAST_THREAD_KEY}${userId ?? 'guest'}`;
}

export const useChatThreads = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadIdState] = useState<string | null>(null);

  const storageKey = getStorageKey(userId);
  const lastThreadKey = getLastThreadKey(userId);

  // Load threads from localStorage
  const loadThreads = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatThread[];
        const withDates = parsed.map((t) => ({
          ...t,
          messages: (t.messages || []).map(parseStoredMessage),
          updatedAt: t.updatedAt || new Date(0).toISOString(),
        }));
        setThreads(withDates);
      } else {
        setThreads([]);
      }
      const last = localStorage.getItem(lastThreadKey);
      if (last) setCurrentThreadIdState(last);
      else setCurrentThreadIdState(null);
    } catch (e) {
      console.error('Failed to load chat threads', e);
      setThreads([]);
      setCurrentThreadIdState(null);
    }
  }, [storageKey, lastThreadKey]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, userId]);

  const persist = useCallback(
    (nextThreads: ChatThread[], lastId: string | null) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(
            nextThreads.map((t) => ({
              ...t,
              messages: t.messages.map((m) => ({
                ...m,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
              })),
            }))
          )
        );
        if (lastId) localStorage.setItem(lastThreadKey, lastId);
        else localStorage.removeItem(lastThreadKey);
      } catch (e) {
        console.error('Failed to persist chat threads', e);
      }
    },
    [storageKey, lastThreadKey]
  );

  const createThread = useCallback((): string => {
    const id = `thread_${Date.now()}`;
    const thread: ChatThread = {
      id,
      title: 'New chat',
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    setThreads((prev) => {
      const next = [thread, ...prev];
      persist(next, id);
      return next;
    });
    setCurrentThreadIdState(id);
    return id;
  }, [persist]);

  const getThread = useCallback(
    (id: string): ChatThread | undefined => {
      return threads.find((t) => t.id === id);
    },
    [threads]
  );

  const switchThread = useCallback(
    (id: string) => {
      setCurrentThreadIdState(id);
      persist(threads, id);
    },
    [threads, persist]
  );

  const updateThread = useCallback(
    (id: string, payload: { title?: string; messages?: Message[]; updatedAt?: string }) => {
      const updatedAt = payload.updatedAt ?? new Date().toISOString();
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(payload.title !== undefined && { title: payload.title }),
                ...(payload.messages !== undefined && { messages: payload.messages }),
                updatedAt,
              }
            : t
        );
        persist(next, currentThreadId);
        return next;
      });
    },
    [currentThreadId, persist]
  );

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        let nextCurrent = currentThreadId;
        if (currentThreadId === id) {
          nextCurrent = next[0]?.id ?? null;
          setCurrentThreadIdState(nextCurrent);
        }
        persist(next, nextCurrent);
        return next;
      });
    },
    [currentThreadId, persist]
  );

  const setCurrentThreadId = useCallback(
    (id: string | null) => {
      setCurrentThreadIdState(id);
      persist(threads, id);
    },
    [threads, persist]
  );

  return {
    threads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    getThread,
    switchThread,
    updateThread,
    deleteThread,
    loadThreads,
  };
};

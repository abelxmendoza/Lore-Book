import type { ChatThread } from '../hooks/useChatThreads';
import type { Message } from '../message/ChatMessage';

const AUTH_CACHE_PREFIX = 'lorekeeper_chat_cache_';

function parseStoredMessage(msg: Record<string, unknown>): Message {
  return {
    ...msg,
    timestamp: msg.timestamp ? new Date(String(msg.timestamp)) : new Date(),
  } as Message;
}

function messagesToJson(messages: Message[]) {
  return messages.map((m) => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
}

export function persistAuthThreadCache(
  userId: string,
  threads: ChatThread[],
  lastThreadId: string | null
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(
      `${AUTH_CACHE_PREFIX}${userId}`,
      JSON.stringify({
        threads: threads.map((t) => ({ ...t, messages: messagesToJson(t.messages) })),
        lastThreadId,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Quota or private mode — non-fatal
  }
}

export function readAuthThreadCache(userId: string): {
  threads: ChatThread[];
  lastThreadId: string | null;
} | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(`${AUTH_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      threads?: ChatThread[];
      lastThreadId?: string | null;
    };
    if (!Array.isArray(parsed.threads)) return null;
    return {
      threads: parsed.threads.map((t) => ({
        ...t,
        messages: (t.messages || []).map((m) => parseStoredMessage(m as Record<string, unknown>)),
        updatedAt: t.updatedAt || new Date(0).toISOString(),
      })),
      lastThreadId: parsed.lastThreadId ?? null,
    };
  } catch {
    return null;
  }
}

export function readAuthThreadFromCache(userId: string, threadId: string): ChatThread | null {
  const cache = readAuthThreadCache(userId);
  return cache?.threads.find((t) => t.id === threadId) ?? null;
}

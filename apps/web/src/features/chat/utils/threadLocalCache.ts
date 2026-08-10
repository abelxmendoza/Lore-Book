import type { ChatThread } from '../hooks/useChatThreads';
import type { Message } from '../message/ChatMessage';

export const AUTH_CACHE_PREFIX = 'lorekeeper_chat_cache_';

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

export function authThreadCacheKey(userId: string): string {
  return `${AUTH_CACHE_PREFIX}${userId}`;
}

export function authThreadSyncPingKey(userId: string): string {
  return `lorekeeper_chat_sync_ping_${userId}`;
}

/**
 * Notify *other* same-origin tabs that the thread cache changed.
 * Uses a companion localStorage key so the `storage` event fires elsewhere
 * (same-tab writes do not emit `storage`, avoiding refresh loops).
 */
export function notifyThreadCacheChanged(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(
      authThreadSyncPingKey(userId),
      JSON.stringify({ userId, at: Date.now() })
    );
  } catch {
    // Private mode / quota — non-fatal
  }
}

export function subscribeThreadCacheChanges(
  userId: string,
  onChange: () => void
): () => void {
  if (typeof window === 'undefined' || !userId) return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key) return;
    if (
      event.key === authThreadCacheKey(userId) ||
      event.key === authThreadSyncPingKey(userId)
    ) {
      onChange();
    }
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function persistAuthThreadCache(
  userId: string,
  threads: ChatThread[],
  lastThreadId: string | null
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(
      authThreadCacheKey(userId),
      JSON.stringify({
        threads: threads.map((t) => ({ ...t, messages: messagesToJson(t.messages) })),
        lastThreadId,
        savedAt: new Date().toISOString(),
      })
    );
    notifyThreadCacheChanged(userId);
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
    const raw = localStorage.getItem(authThreadCacheKey(userId));
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

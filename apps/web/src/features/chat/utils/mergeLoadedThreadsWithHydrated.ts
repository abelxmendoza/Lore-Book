import type { ChatThread } from '../hooks/useChatThreads';

/** Keep in-memory hydrated messages when the authoritative thread list arrives. */
export function mergeLoadedThreadsWithHydrated(
  loaded: ChatThread[],
  prev: ChatThread[]
): ChatThread[] {
  if (prev.length === 0) return loaded;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  return loaded.map((t) => {
    const existing = prevById.get(t.id);
    if (!existing?.messages.length) return t;
    const existingUpdated = new Date(existing.updatedAt).getTime();
    const loadedUpdated = new Date(t.updatedAt).getTime();
    return {
      ...t,
      messages: existing.messages,
      updatedAt: existingUpdated > loadedUpdated ? existing.updatedAt : t.updatedAt,
    };
  });
}

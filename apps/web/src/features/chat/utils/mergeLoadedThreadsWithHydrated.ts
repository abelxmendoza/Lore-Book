import type { ChatThread } from '../hooks/useChatThreads';
import { sortThreadsByActivity } from './sortThreadsChronologically';
import { isGenericThreadTitle } from './threadTitleUtils';

const PENDING_DRAFT_TTL_MS = 60 * 60 * 1000; // keep optimistic empty drafts for 1h

function preferTitle(serverTitle: string, localTitle: string): string {
  if (isGenericThreadTitle(serverTitle) && !isGenericThreadTitle(localTitle)) {
    return localTitle;
  }
  return serverTitle || localTitle;
}

function shouldKeepPendingLocal(thread: ChatThread): boolean {
  const hasContent = (thread.messages?.length ?? 0) > 0 || (thread.messageCount ?? 0) > 0;
  if (hasContent) return true;
  const age = Date.now() - new Date(thread.updatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < PENDING_DRAFT_TTL_MS;
}

/**
 * Merge the authoritative server thread list with in-memory state.
 */
export function mergeLoadedThreadsWithHydrated(
  loaded: ChatThread[],
  prev: ChatThread[]
): ChatThread[] {
  if (prev.length === 0) return sortThreadsByActivity(loaded);

  const prevById = new Map(prev.map((t) => [t.id, t]));
  const loadedIds = new Set(loaded.map((t) => t.id));

  const mergedLoaded = loaded.map((t) => {
    const existing = prevById.get(t.id);
    if (!existing) return t;

    const existingUpdated = new Date(existing.updatedAt).getTime();
    const loadedUpdated = new Date(t.updatedAt).getTime();
    const keepMessages = existing.messages.length > 0;

    return {
      ...t,
      title: preferTitle(t.title, existing.title),
      subtitle: t.subtitle ?? existing.subtitle,
      dominantEntities: t.dominantEntities ?? existing.dominantEntities,
      threadNumber: t.threadNumber ?? existing.threadNumber,
      ...(keepMessages ? { messages: existing.messages } : {}),
      updatedAt: existingUpdated > loadedUpdated ? existing.updatedAt : t.updatedAt,
    };
  });

  const pendingOnly = prev.filter((t) => !loadedIds.has(t.id) && shouldKeepPendingLocal(t));

  return sortThreadsByActivity([...pendingOnly, ...mergedLoaded]);
}

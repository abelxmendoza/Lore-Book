import type { ChatThread } from '../hooks/useChatThreads';
import { sortThreadsByActivity } from './sortThreadsChronologically';
import { isGenericThreadTitle } from './threadTitleUtils';

const PENDING_DRAFT_TTL_MS = 60 * 60 * 1000; // keep optimistic empty drafts for 1h
/** Keep a just-bumped local updatedAt until the server write lands. */
export const LOCAL_ACTIVITY_GRACE_MS = 60_000;

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
 * Prefer server activity time for cross-device order, but keep a very recent
 * local bump (in-flight send) so quiet refresh does not drop the active thread.
 */
export function resolveThreadUpdatedAt(
  serverUpdatedAt: string,
  localUpdatedAt?: string | null,
  nowMs: number = Date.now()
): string {
  if (!localUpdatedAt) return serverUpdatedAt;
  const serverMs = Date.parse(serverUpdatedAt);
  const localMs = Date.parse(localUpdatedAt);
  if (!Number.isFinite(localMs)) return serverUpdatedAt;
  if (!Number.isFinite(serverMs)) return localUpdatedAt;
  if (localMs <= serverMs) return serverUpdatedAt;
  const age = nowMs - localMs;
  if (age >= 0 && age < LOCAL_ACTIVITY_GRACE_MS) return localUpdatedAt;
  return serverUpdatedAt;
}

/**
 * Merge the authoritative server thread list with in-memory state.
 *
 * Ordering follows server `updatedAt` across devices, with a short grace window
 * for optimistic local activity bumps that have not yet been confirmed.
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

    const keepMessages = existing.messages.length > 0;

    return {
      ...t,
      title: preferTitle(t.title, existing.title),
      subtitle: t.subtitle ?? existing.subtitle,
      dominantEntities: t.dominantEntities ?? existing.dominantEntities,
      threadNumber: t.threadNumber ?? existing.threadNumber,
      ...(keepMessages ? { messages: existing.messages } : {}),
      updatedAt: resolveThreadUpdatedAt(t.updatedAt, existing.updatedAt),
    };
  });

  const pendingOnly = prev.filter((t) => !loadedIds.has(t.id) && shouldKeepPendingLocal(t));

  return sortThreadsByActivity([...pendingOnly, ...mergedLoaded]);
}

import type { ChatThread } from '../hooks/useChatThreads';
import { sortThreadsByActivity } from './sortThreadsChronologically';
import { isGenericThreadTitle } from './threadTitleUtils';
import { threadPersistenceTracker } from '../services/threadPersistenceTracker';

const PENDING_DRAFT_TTL_MS = 60 * 60 * 1000; // keep optimistic empty drafts for 1h
/** Keep a just-bumped local updatedAt until the server write lands. */
export const LOCAL_ACTIVITY_GRACE_MS = 60_000;
/** Matches the page size useChatThreads requests from fetchThreadsPage. */
export const DEFAULT_THREAD_PAGE_LIMIT = 30;

function isGenuinelyPending(threadId: string): boolean {
  const state = threadPersistenceTracker.get(threadId)?.state;
  return state === 'PERSIST_PENDING' || state === 'PERSISTING' || state === 'LOCAL_ONLY';
}

function preferTitle(serverTitle: string, localTitle: string): string {
  if (isGenericThreadTitle(serverTitle) && !isGenericThreadTitle(localTitle)) {
    return localTitle;
  }
  return serverTitle || localTitle;
}

/**
 * Should a thread that's absent from the fresh server page still be shown
 * from local/cached state? Two very different cases both reach here:
 *
 *   - A real thread with real messages, cached from a prior session, that
 *     the server page no longer includes. Absence is ambiguous by itself —
 *     it could mean "just paginated out" (real, still exists, just below the
 *     page limit) or "deleted/renamed on another device" (gone, must not be
 *     resurrected). Genuinely-unconfirmed writes (tracked as still pending)
 *     always survive; otherwise only keep it if it's plausibly *older* than
 *     everything on this page — if it's absent AND would have sorted above
 *     the page's oldest row, it was removed server-side, not paginated out.
 *   - An empty draft thread not yet round-tripped to the server at all — kept
 *     for a bounded TTL regardless of the page window (unchanged from before).
 */
function shouldKeepPendingLocal(
  thread: ChatThread,
  loadedOldestMs: number,
  pageWasFull: boolean
): boolean {
  const hasContent = (thread.messages?.length ?? 0) > 0 || (thread.messageCount ?? 0) > 0;
  if (hasContent) {
    if (isGenuinelyPending(thread.id)) return true;
    // A short page is the complete server list. Absence means deleted / never
    // persisted — not "paginated out". Keeping these rows lets the recovery
    // cache override an authoritative empty or short response.
    if (!pageWasFull) return false;
    const threadMs = Date.parse(thread.updatedAt);
    return Number.isFinite(threadMs) && Number.isFinite(loadedOldestMs) && threadMs < loadedOldestMs;
  }
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
  prev: ChatThread[],
  pageLimit: number = DEFAULT_THREAD_PAGE_LIMIT
): ChatThread[] {
  if (prev.length === 0) return sortThreadsByActivity(loaded);

  const prevById = new Map(prev.map((t) => [t.id, t]));
  const loadedIds = new Set(loaded.map((t) => t.id));
  const pageWasFull = loaded.length >= pageLimit;
  const loadedOldestMs = loaded.reduce((min, t) => {
    const ms = Date.parse(t.updatedAt);
    return Number.isFinite(ms) ? Math.min(min, ms) : min;
  }, Infinity);

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

  const pendingOnly = prev.filter(
    (t) => !loadedIds.has(t.id) && shouldKeepPendingLocal(t, loadedOldestMs, pageWasFull)
  );

  return sortThreadsByActivity([...pendingOnly, ...mergedLoaded]);
}

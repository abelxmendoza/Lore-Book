import type { ChatThread } from '../hooks/useChatThreads';

/**
 * Activity timestamp for sidebar order — matches server list ordering
 * (`conversation_sessions.updated_at`). Do not mix in local message clocks:
 * that made hydrated devices reorder differently from fresh ones.
 */
export function threadActivityMs(thread: {
  id?: string;
  updatedAt?: string | null;
  messages?: Array<{ timestamp?: Date | string | null }>;
}): number {
  if (thread.updatedAt) {
    const updated = Date.parse(thread.updatedAt);
    if (Number.isFinite(updated)) return updated;
  }
  return 0;
}

/**
 * Newest server activity first (reverse chronological). Stable tie-break on id.
 * Single source of truth for thread list order across mobile and desktop.
 */
export function sortThreadsChronologically<T extends {
  id: string;
  updatedAt?: string | null;
  messages?: Array<{ timestamp?: Date | string | null }>;
}>(threads: T[]): T[] {
  return [...threads].sort((a, b) => {
    const diff = threadActivityMs(b) - threadActivityMs(a);
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Convenience alias used by merge / hooks (same semantics). */
export function sortThreadsByActivity(threads: ChatThread[]): ChatThread[] {
  return sortThreadsChronologically(threads);
}

import type { ChatThread } from '../hooks/useChatThreads';

/**
 * Best activity timestamp for sidebar order:
 * max(updatedAt, last message timestamp). Invalid clocks fall back safely.
 */
export function threadActivityMs(thread: {
  id?: string;
  updatedAt?: string | null;
  messages?: Array<{ timestamp?: Date | string | null }>;
}): number {
  let best = 0;

  if (thread.updatedAt) {
    const updated = Date.parse(thread.updatedAt);
    if (Number.isFinite(updated)) best = Math.max(best, updated);
  }

  const messages = thread.messages;
  if (messages?.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const ts = messages[i]?.timestamp;
      if (!ts) continue;
      const ms = ts instanceof Date ? ts.getTime() : Date.parse(String(ts));
      if (Number.isFinite(ms)) {
        best = Math.max(best, ms);
        break;
      }
    }
  }

  return best;
}

/**
 * Newest activity first (reverse chronological). Stable tie-break on id.
 * This is the single source of truth for thread list order across devices.
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

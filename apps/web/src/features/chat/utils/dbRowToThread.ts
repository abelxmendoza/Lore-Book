import type { ChatThread } from '../hooks/useChatThreads';
import { DRAFT_THREAD_TITLE, normalizeThreadTitle } from './threadTitleUtils';

/**
 * Map a conversation thread list/API row into client ChatThread shape.
 * Accepts camelCase (API) and snake_case (raw DB) so login reloads keep real
 * activity timestamps instead of collapsing everything to "now".
 */
export function dbRowToThread(t: any): ChatThread {
  const messageCount =
    typeof t.messageCount === 'number'
      ? t.messageCount
      : typeof t.message_count === 'number'
        ? t.message_count
        : undefined;
  const threadNumber =
    typeof t.threadNumber === 'number'
      ? t.threadNumber
      : typeof t.thread_number === 'number'
        ? t.thread_number
        : undefined;
  const updatedAt =
    t.updatedAt ||
    t.updated_at ||
    t.createdAt ||
    t.created_at ||
    new Date().toISOString();
  const subtitle =
    (typeof t.subtitle === 'string' ? t.subtitle : undefined) ??
    (t.metadata?.subtitle as string | undefined);
  const dominantEntities = Array.isArray(t.dominantEntities)
    ? t.dominantEntities
    : Array.isArray(t.metadata?.dominantEntities)
      ? t.metadata.dominantEntities
      : undefined;

  const thread: ChatThread = {
    id: t.id,
    title: t.title || DRAFT_THREAD_TITLE,
    subtitle,
    dominantEntities,
    messages: [],
    updatedAt,
    ...(messageCount !== undefined ? { messageCount } : {}),
    ...(threadNumber !== undefined ? { threadNumber } : {}),
  };
  return normalizeThreadTitle(thread);
}

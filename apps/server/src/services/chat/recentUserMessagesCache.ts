import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type RecentUserMessage = {
  id: string;
  content: string;
  created_at: string;
  role?: string;
};

const CACHE_TTL_MS = 15_000;
const MAX_ROWS = 1000;

const cache = new Map<string, { expires: number; promise: Promise<RecentUserMessage[]> }>();

/**
 * Fetches a user's most recent chat messages (role=user) once and shares the
 * result across concurrent callers for a short window.
 *
 * Character, location, and group analytics each independently need "the
 * user's recent messages" to text-search for entity mentions, all using the
 * same 90-day / 1000-row shape. Before this cache, every character,
 * organization, and location in a user's roster triggered its own full
 * refetch of the same rows — dozens of near-duplicate queries per chat turn,
 * adding to DB connection-pool pressure. Fetching the latest MAX_ROWS once
 * and filtering by `since` in memory is equivalent to each caller's original
 * `.gte(since).order(desc).limit(MAX_ROWS)` query: if fewer than MAX_ROWS
 * messages exist after `since`, both approaches return the same set; if
 * more exist, the newest MAX_ROWS are by definition all after `since` too.
 */
export function getRecentUserMessages(userId: string, since: Date): Promise<RecentUserMessage[]> {
  const now = Date.now();
  const cached = cache.get(userId);
  const promise =
    cached && cached.expires > now
      ? cached.promise
      : (() => {
          const fetchPromise: Promise<RecentUserMessage[]> = Promise.resolve(
            supabaseAdmin
              .from('chat_messages')
              .select('id, content, created_at, role')
              .eq('user_id', userId)
              .eq('role', 'user')
              .order('created_at', { ascending: false })
              .limit(MAX_ROWS)
          ).then(({ data, error }) => {
            if (error) {
              logger.error({ error, userId }, 'Failed to fetch recent user chat messages');
              return [];
            }
            return (data ?? []) as RecentUserMessage[];
          });
          cache.set(userId, { expires: now + CACHE_TTL_MS, promise: fetchPromise });
          return fetchPromise;
        })();

  const cutoff = since.getTime();
  return promise.then((rows) => rows.filter((row) => new Date(row.created_at).getTime() >= cutoff));
}

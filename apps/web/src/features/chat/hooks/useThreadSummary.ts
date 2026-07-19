import { useCallback, useEffect, useState } from 'react';
import { fetchThreadSummary, refreshThreadSummary, type ThreadSummaryResponse } from '../../../api/threadSummary';
import { useAuth } from '../../../lib/supabase';

/**
 * A 404 means the thread has not been persisted to the server yet (optimistic
 * local thread, or the first send is still syncing). That is "no summary yet",
 * not a failure — showing the "Summary unavailable" notice for it is noise.
 */
function isThreadNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status =
    (err as Error & { status?: number }).status ??
    (err.cause instanceof Error ? (err.cause as Error & { status?: number }).status : undefined);
  return status === 404 || err.message === 'Thread not found';
}

export function useThreadSummary(threadId: string | null, messageCount: number) {
  const { user } = useAuth();
  const [data, setData] = useState<ThreadSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId || !user?.id || messageCount === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchThreadSummary(threadId);
      setData(result);
    } catch (err) {
      if (isThreadNotFound(err)) {
        setData(null);
      } else {
        setError(err instanceof Error ? err.message : 'Could not load thread summary');
      }
    } finally {
      setLoading(false);
    }
  }, [threadId, user?.id, messageCount]);

  const refresh = useCallback(async () => {
    if (!threadId || !user?.id) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshThreadSummary(threadId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh summary');
    } finally {
      setRefreshing(false);
    }
  }, [threadId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, refreshing, error, reload: load, refresh };
}

import { useCallback, useEffect, useState } from 'react';
import { fetchThreadSummary, refreshThreadSummary, type ThreadSummaryResponse } from '../../../api/threadSummary';
import { useAuth } from '../../../lib/supabase';

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
      setError(err instanceof Error ? err.message : 'Could not load thread summary');
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

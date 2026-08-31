import { useCallback, useEffect, useState } from 'react';

import { fetchSaga, type SagaOverview } from '../api/saga';
import { useMockData } from '../contexts/MockDataContext';
import { onStoryDataUpdated } from '../lib/storyRefresh';

export const useSaga = () => {
  const [saga, setSaga] = useState<SagaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { useMockData: isMock } = useMockData();

  const refresh = useCallback(async () => {
    setError(null);
    if (isMock) {
      // Mock data is handled in the component — no fetch needed
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { saga: data } = await fetchSaga();
      setSaga(data);
    } catch (cause) {
      setSaga(null);
      setError(cause instanceof Error ? cause.message : 'We could not load your Life Saga.');
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onStoryDataUpdated(() => void refresh(), 'story'), [refresh]);

  return { saga, refresh, loading, error, isMock };
};

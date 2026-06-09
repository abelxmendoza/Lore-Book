import { useCallback, useEffect, useState } from 'react';

import { fetchSaga, type SagaOverview } from '../api/saga';
import { useMockData } from '../contexts/MockDataContext';

export const useSaga = () => {
  const [saga, setSaga] = useState<SagaOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const { useMockData: isMock } = useMockData();

  const refresh = useCallback(async () => {
    if (isMock) {
      // Mock data is handled in the component — no fetch needed
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { saga: data } = await fetchSaga();
      setSaga(data);
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { saga, refresh, loading, isMock };
};

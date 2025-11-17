import { useCallback, useEffect, useState } from 'react';

import { fetchSaga, type SagaOverview } from '../api/saga';

export const useSaga = () => {
  const [saga, setSaga] = useState<SagaOverview | null>(null);

  const refresh = useCallback(async () => {
    const { saga: data } = await fetchSaga();
    setSaga(data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { saga, refresh };
};

import { useCallback, useEffect, useState } from 'react';

import { fetchIdentityPulse, type IdentityPulse } from '../api/identity';

export const useIdentityPulse = (timeRange: string = '30') => {
  const [pulse, setPulse] = useState<IdentityPulse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIdentityPulse(timeRange);
      setPulse(data);
    } catch (error) {
      console.error('Failed to fetch identity pulse:', error);
      // Don't set pulse to null on error - let component use mock data
      setPulse(null);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pulse, loading, refresh };
};

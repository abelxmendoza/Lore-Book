import { useCallback, useEffect, useState } from 'react';

import { fetchIdentityPulse, type IdentityPulse } from '../api/identity';

export const useIdentityPulse = () => {
  const [pulse, setPulse] = useState<IdentityPulse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { pulse: data } = await fetchIdentityPulse();
      setPulse(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pulse, loading, refresh };
};

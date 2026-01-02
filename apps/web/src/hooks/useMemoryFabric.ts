import { useCallback, useEffect, useState } from 'react';

import { fetchFabric, type FabricSnapshot } from '../api/fabric';
import { fetchJson } from '../lib/api';
import { config } from '../config/env';

export const useMemoryFabric = () => {
  const [snapshot, setSnapshot] = useState<FabricSnapshot | null>(null);
  const [filters, setFilters] = useState<{ relation?: string; search?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fabric } = await fetchFabric();
      setSnapshot(fabric);
    } catch (err) {
      console.error('Failed to fetch memory fabric:', err);
      setError(err instanceof Error ? err.message : 'Failed to load memory fabric');
      // Use empty snapshot on error
      setSnapshot({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, filters, setFilters, refresh, loading, error };
};

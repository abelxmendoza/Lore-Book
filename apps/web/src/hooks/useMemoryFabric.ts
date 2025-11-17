import { useCallback, useEffect, useState } from 'react';

import { fetchFabric, type FabricSnapshot } from '../api/fabric';

export const useMemoryFabric = () => {
  const [snapshot, setSnapshot] = useState<FabricSnapshot | null>(null);
  const [filters, setFilters] = useState<{ relation?: string; search?: string }>({});

  const refresh = useCallback(async () => {
    const { fabric } = await fetchFabric();
    setSnapshot(fabric);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, filters, setFilters, refresh };
};

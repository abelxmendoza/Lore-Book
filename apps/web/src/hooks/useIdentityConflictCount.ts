import { useEffect, useState } from 'react';

import { entityResolutionApi } from '../api/entityResolution';
import { useShouldUseMockData } from './useShouldUseMockData';

const CACHE_TTL_MS = 45_000;
let cachedCount = 0;
let lastFetch = 0;

/**
 * Open identity-conflict count for sidebar badge on Identity Center.
 */
export function useIdentityConflictCount(): number {
  const isMock = useShouldUseMockData();
  const [count, setCount] = useState(cachedCount);

  useEffect(() => {
    if (isMock) {
      setCount(4); // matches EntityResolutionBook MOCK_CONFLICTS length
      return;
    }
    const now = Date.now();
    if (now - lastFetch < CACHE_TTL_MS && lastFetch > 0) {
      setCount(cachedCount);
      return;
    }
    let cancelled = false;
    entityResolutionApi
      .listConflicts()
      .then((rows) => {
        const open = rows.filter((c) => c.status === 'OPEN').length;
        cachedCount = open;
        lastFetch = Date.now();
        if (!cancelled) setCount(open);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isMock]);

  return count;
}

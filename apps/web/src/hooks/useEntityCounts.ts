import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';

interface EntityCounts {
  characters: number;
  locations: number;
  events: number;
  organizations: number;
  skills: number;
}

const CACHE_TTL = 60_000; // 1 minute
let cachedCounts: EntityCounts | null = null;
let lastFetch = 0;

export const useEntityCounts = () => {
  const [counts, setCounts] = useState<EntityCounts | null>(cachedCounts);

  useEffect(() => {
    const now = Date.now();
    if (cachedCounts && now - lastFetch < CACHE_TTL) {
      setCounts(cachedCounts);
      return;
    }
    fetchJson<EntityCounts>('/api/counts')
      .then(data => {
        cachedCounts = data;
        lastFetch = Date.now();
        setCounts(data);
      })
      .catch(() => {});
  }, []);

  return counts;
};

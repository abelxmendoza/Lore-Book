import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';

interface EntityCounts {
  characters: number;
  locations: number;
  events: number;
  organizations: number;
  skills: number;
  projects: number;
}

const CACHE_TTL = 60_000; // 1 minute
let cachedCounts: EntityCounts | null = null;
let lastFetch = 0;
// Shared in-flight request so concurrent mounts (e.g. Sidebar + HomeScreen
// both mounting on initial load) await the same fetch instead of each
// firing their own — the resolved-value cache above only helps *sequential*
// calls, since it stays empty until the first request actually resolves.
let inFlight: Promise<EntityCounts> | null = null;

export const useEntityCounts = () => {
  const [counts, setCounts] = useState<EntityCounts | null>(cachedCounts);

  useEffect(() => {
    const now = Date.now();
    if (cachedCounts && now - lastFetch < CACHE_TTL) {
      setCounts(cachedCounts);
      return;
    }
    if (!inFlight) {
      inFlight = fetchJson<EntityCounts>('/api/counts').finally(() => {
        inFlight = null;
      });
    }
    inFlight
      .then(data => {
        cachedCounts = data;
        lastFetch = Date.now();
        setCounts(data);
      })
      .catch(() => {});
  }, []);

  return counts;
};

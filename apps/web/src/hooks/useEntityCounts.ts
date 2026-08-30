import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { onStoryDataUpdated } from '../lib/storyRefresh';

export interface EntityCounts {
  characters: number;
  family: number;
  romantic: number;
  locations: number;
  events: number;
  organizations: number;
  skills: number;
  projects: number;
  anchors: number;
}

const CACHE_TTL = 60_000; // 1 minute
const cachedCounts = new Map<string, { data: EntityCounts; fetchedAt: number }>();
// Shared in-flight request so concurrent mounts (e.g. Sidebar + HomeScreen
// both mounting on initial load) await the same fetch instead of each
// firing their own — the resolved-value cache above only helps *sequential*
// calls, since it stays empty until the first request actually resolves.
const inFlight = new Map<string, Promise<EntityCounts>>();

export const useEntityCounts = (cacheKey = 'current-user') => {
  const [counts, setCounts] = useState<EntityCounts | null>(
    () => cachedCounts.get(cacheKey)?.data ?? null,
  );

  useEffect(() => {
    let active = true;
    setCounts(cachedCounts.get(cacheKey)?.data ?? null);

    const load = (force = false) => {
      const cached = cachedCounts.get(cacheKey);
      if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        setCounts(cached.data);
        return;
      }
      let request = inFlight.get(cacheKey);
      if (!request) {
        // Counts own a short per-account cache below. Bypass fetchJson's
        // URL-only cache so refreshes and account switches cannot reuse stale
        // totals from another session.
        request = fetchJson<EntityCounts>('/api/counts', undefined, { cache: false }).finally(() => {
          inFlight.delete(cacheKey);
        });
        inFlight.set(cacheKey, request);
      }
      void request
        .then((data) => {
          cachedCounts.set(cacheKey, { data, fetchedAt: Date.now() });
          if (active) setCounts(data);
        })
        .catch(() => {});
    };

    load();
    const unsubscribeStory = onStoryDataUpdated(() => load(true));
    const refreshRomance = () => load(true);
    window.addEventListener('lk:romantic-relationships-updated', refreshRomance);
    return () => {
      active = false;
      unsubscribeStory();
      window.removeEventListener('lk:romantic-relationships-updated', refreshRomance);
    };
  }, [cacheKey]);

  return counts;
};

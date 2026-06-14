import { useCallback, useEffect, useRef, useState } from 'react';
import { threadExplorerApi, type ThreadExploreHit, type ThreadFacets } from '../../../api/threadExplorer';

export function useThreadExplorer(searchQuery: string, enabled = true) {
  const [hits, setHits] = useState<ThreadExploreHit[]>([]);
  const [facets, setFacets] = useState<ThreadFacets | null>(null);
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runExplore = useCallback(async (q: string, entity: string | null) => {
    const trimmed = q.trim();
    if (trimmed.length < 2 && !entity) {
      setHits([]);
      setActive(false);
      return;
    }
    setLoading(true);
    try {
      const result = await threadExplorerApi.explore({
        q: trimmed || undefined,
        entity: entity ?? undefined,
        limit: 30,
      });
      setHits(result.hits ?? []);
      setFacets(result.facets ?? null);
      setActive(true);
    } catch {
      setHits([]);
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      void runExplore(searchQuery, entityFilter);
    }, searchQuery.trim().length >= 2 || entityFilter ? 280 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, entityFilter, enabled, runExplore]);

  useEffect(() => {
    if (!enabled || facets) return;
    threadExplorerApi.facets().then(r => setFacets(r.facets)).catch(() => {});
  }, [enabled, facets]);

  return {
    hits,
    facets,
    entityFilter,
    setEntityFilter,
    loading,
    active,
    clearFilters: () => setEntityFilter(null),
  };
}

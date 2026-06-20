import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../lib/api';
import type {
  EntitySearchResponse,
  EntitySearchResult,
  EntitySearchType,
} from '../api/entitySearch';

type UseEntitySearchOptions = {
  query: string;
  types?: EntitySearchType[];
  previewType?: string;
  limit?: number;
  enabled?: boolean;
  debounceMs?: number;
};

type UseEntitySearchResult = {
  results: EntitySearchResult[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useEntitySearch({
  query,
  types,
  previewType,
  limit = 10,
  enabled = true,
  debounceMs = 250,
}: UseEntitySearchOptions): UseEntitySearchResult {
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < 1) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: trimmed,
        limit: String(limit),
      });
      if (types?.length) params.set('types', types.join(','));
      if (previewType) params.set('previewType', previewType);

      const data = await fetchJson<EntitySearchResponse>(
        `/api/entities/search?${params.toString()}`
      );

      if (id === requestId.current) {
        setResults(data.results);
      }
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [query, types, previewType, limit, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(runSearch, debounceMs);
    return () => clearTimeout(timer);
  }, [runSearch, debounceMs, enabled]);

  return { results, loading, error, refresh: runSearch };
}

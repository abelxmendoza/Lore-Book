import { useCallback, useEffect, useState } from 'react';

import { searchHQI, type HQIResult } from '../api/hqi';

export type HQIFilters = {
  scope?: string[];
  tags?: string[];
};

export const useHQISearch = () => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HQIFilters>({});
  const [results, setResults] = useState<HQIResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(
    async (nextQuery?: string) => {
      const searchTerm = nextQuery ?? query;
      if (!searchTerm) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const { results: data } = await searchHQI({ query: searchTerm, filters });
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [filters, query]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        runSearch();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [runSearch]);

  return { query, setQuery, filters, setFilters, results, loading, runSearch };
};

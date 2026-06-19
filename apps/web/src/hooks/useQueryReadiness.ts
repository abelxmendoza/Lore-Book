import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/api';
import type { LoreReadinessEvaluation } from '../lib/loreReadiness';
import { useShouldUseMockData } from './useShouldUseMockData';

type UseQueryReadinessResult = {
  evaluation: LoreReadinessEvaluation | null;
  loading: boolean;
};

export function useQueryReadiness(query: string, enabled = true): UseQueryReadinessResult {
  const isMock = useShouldUseMockData();
  const trimmed = query.trim();
  const [evaluation, setEvaluation] = useState<LoreReadinessEvaluation | null>(null);
  const [loading, setLoading] = useState(false);

  const debounceKey = useMemo(() => trimmed, [trimmed]);

  useEffect(() => {
    if (!enabled || trimmed.length < 3 || isMock) {
      setEvaluation(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      void fetchJson<{ evaluation: LoreReadinessEvaluation }>('/api/biography/readiness/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
        .then((result) => {
          if (!cancelled) setEvaluation(result.evaluation);
        })
        .catch(() => {
          if (!cancelled) setEvaluation(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [debounceKey, enabled, isMock, trimmed]);

  return { evaluation, loading };
}

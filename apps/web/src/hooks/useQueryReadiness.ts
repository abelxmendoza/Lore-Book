import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/api';
import type { LorebookFocusEntity } from '../lib/lorebookCompile';
import type { LoreReadinessEvaluation } from '../lib/loreReadiness';
import { useShouldUseMockData } from './useShouldUseMockData';

type UseQueryReadinessResult = {
  evaluation: LoreReadinessEvaluation | null;
  loading: boolean;
};

export function buildQueryReadinessRequest(
  query: string,
  focusEntity?: LorebookFocusEntity | null,
): Record<string, unknown> {
  if (!focusEntity) return { query: query.trim() };
  if (focusEntity.type === 'person') return { characterId: focusEntity.id };
  if (focusEntity.type === 'place') return { locationId: focusEntity.id };
  if (focusEntity.type === 'skill') return { skillId: focusEntity.id };
  if (focusEntity.type === 'event') {
    return {
      spec: {
        scope: 'event',
        eventIds: [focusEntity.id],
        tone: 'neutral',
        depth: 'detailed',
        audience: 'self',
        includeIntrospection: true,
      },
    };
  }
  return { organizationId: focusEntity.id };
}

export function useQueryReadiness(
  query: string,
  enabled = true,
  focusEntity?: LorebookFocusEntity | null,
): UseQueryReadinessResult {
  const isMock = useShouldUseMockData();
  const trimmed = query.trim();
  const [evaluation, setEvaluation] = useState<LoreReadinessEvaluation | null>(null);
  const [loading, setLoading] = useState(false);

  const focusKey = focusEntity ? `${focusEntity.type}:${focusEntity.id}` : '';
  const debounceKey = useMemo(() => `${trimmed}|${focusKey}`, [focusKey, trimmed]);

  useEffect(() => {
    if (!enabled || (!focusEntity && trimmed.length < 3) || isMock) {
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
        body: JSON.stringify(buildQueryReadinessRequest(trimmed, focusEntity)),
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
  }, [debounceKey, enabled, focusEntity, isMock, trimmed]);

  return { evaluation, loading };
}

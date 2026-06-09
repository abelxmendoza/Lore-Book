/**
 * useDiscoverySummary
 *
 * Fetches lightweight count data that drives:
 *   - Badge numbers in DiscoveryNav
 *   - Attention-needed section in DiscoveryOverview
 *
 * Only reads three existing endpoints; adds no new backend.
 * Runs once on mount and is shared by DiscoveryNav + DiscoveryOverview
 * via the same hook (React deduplication when called from siblings is
 * intentionally accepted here — counts are cheap).
 */

import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export interface DiscoverySummary {
  pendingProposals: number;
  openContradictions: number;
  fadingMemories: number;
  /** Most recent insight text (truncated), if available */
  topInsight: string | null;
  /** Current life chapter label from the biography pipeline */
  currentChapter: string | null;
}

interface UseDiscoverySummaryResult {
  summary: DiscoverySummary | null;
  loading: boolean;
}

const DEFAULT_SUMMARY: DiscoverySummary = {
  pendingProposals: 0,
  openContradictions: 0,
  fadingMemories: 0,
  topInsight: null,
  currentChapter: null,
};

export function useDiscoverySummary(): UseDiscoverySummaryResult {
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        // All fetches run in parallel — fail individually, never block each other
        const [mrqResult, contradictionsResult, fadingResult, insightsResult, bioResult] =
          await Promise.allSettled([
            fetchJson<{ items: unknown[] }>('/api/mrq/pending'),
            fetchJson<{ contradictions: unknown[] }>('/api/corrections/contradictions'),
            fetchJson<{ entries: unknown[] }>('/api/entries/fading?limit=20'),
            fetchJson<{ insights: Array<{ text?: string; body?: string }> }>('/api/insights?dismissed=false&limit=1'),
            fetchJson<{ card: { currentChapter?: { label: string } | null } }>('/api/biography/living'),
          ]);

        if (cancelled) return;

        const pendingProposals =
          mrqResult.status === 'fulfilled' ? (mrqResult.value.items?.length ?? 0) : 0;
        const openContradictions =
          contradictionsResult.status === 'fulfilled'
            ? (contradictionsResult.value.contradictions?.length ?? 0)
            : 0;
        const fadingMemories =
          fadingResult.status === 'fulfilled' ? (fadingResult.value.entries?.length ?? 0) : 0;

        let topInsight: string | null = null;
        if (insightsResult.status === 'fulfilled') {
          const first = insightsResult.value.insights?.[0];
          topInsight = first?.text ?? first?.body ?? null;
        }

        let currentChapter: string | null = null;
        if (bioResult.status === 'fulfilled') {
          currentChapter = bioResult.value.card?.currentChapter?.label ?? null;
        }

        setSummary({
          pendingProposals,
          openContradictions,
          fadingMemories,
          topInsight,
          currentChapter,
        });
      } catch {
        // Never crash the page — fall back to zero counts
        if (!cancelled) setSummary(DEFAULT_SUMMARY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetch();
    return () => { cancelled = true; };
  }, []);

  return { summary, loading };
}

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';

export type GithubMilestone = {
  title: string;
  summary: string;
  significance: number;
  metadata?: Record<string, unknown>;
};

export type GithubSummary = { repo: string; milestones: GithubMilestone[] };

export const useGithubSync = () => {
  const [summaries, setSummaries] = useState<GithubSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ summaries: GithubSummary[] }>('/api/github/summaries');
      setSummaries(data.summaries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GitHub summaries');
    } finally {
      setLoading(false);
    }
  }, []);

  const linkRepo = useCallback(async (repoUrl: string) => {
    await fetchJson('/api/github/link', {
      method: 'POST',
      body: JSON.stringify({ repoUrl })
    });
    await refresh();
  }, [refresh]);

  const syncRepo = useCallback(async (repoUrl: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ milestone: GithubMilestone }>('/api/github/sync', {
        method: 'POST',
        body: JSON.stringify({ repoUrl })
      });
      await refresh();
      return data.milestone;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const latestMilestones = useMemo(() => {
    return summaries.flatMap((summary) => summary.milestones.slice(0, 3));
  }, [summaries]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summaries, latestMilestones, loading, error, refresh, linkRepo, syncRepo };
};

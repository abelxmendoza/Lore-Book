import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';

type ExternalSource = 'github' | 'instagram' | 'x' | 'calendar' | 'photos';

export type ExternalSourceStatus = {
  source: ExternalSource;
  connected: boolean;
  lastSync: string | null;
};

export type ExternalTimelineEntry = {
  source: ExternalSource;
  timestamp: string;
  type: string;
  text?: string;
  summary?: string;
  tags?: string[];
};

export const useExternalHub = () => {
  const [sources, setSources] = useState<ExternalSourceStatus[]>([]);
  const [timeline, setTimeline] = useState<ExternalTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ sources: ExternalSourceStatus[]; timeline: ExternalTimelineEntry[] }>('/api/external-hub/status');
      setSources(data.sources ?? []);
      setTimeline(data.timeline ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration status');
    } finally {
      setLoading(false);
    }
  }, []);

  const ingest = useCallback(
    async (source: ExternalSource, payload?: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        await fetchJson(`/api/external-hub/${source}/ingest`, {
          method: 'POST',
          body: JSON.stringify(payload ?? buildSamplePayload(source)),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync source');
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  const latest = useMemo(() => timeline.slice(-5).reverse(), [timeline]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sources, timeline, latest, loading, error, refresh, ingest };
};

function buildSamplePayload(source: ExternalSource): Record<string, unknown> {
  switch (source) {
    case 'github':
      return {
        commits: [{ message: 'Docs touch-up', timestamp: new Date().toISOString() }],
        milestones: [{ title: 'Prototype ready', closed_at: new Date().toISOString() }],
      };
    case 'instagram':
      return {
        items: [
          {
            timestamp: new Date().toISOString(),
            media_type: 'post',
            caption: 'Sunset #vibes',
            media_url: '',
          },
        ],
      };
    case 'x':
      return { posts: [{ created_at: new Date().toISOString(), text: 'Shipping the External Hub' }] };
    case 'calendar':
      return {
        events: [
          {
            id: 'planning',
            start: new Date().toISOString(),
            title: 'Planning session',
            attendees: ['alice', 'bob'],
          },
        ],
      };
    case 'photos':
      return {
        photos: [{
          captured_at: new Date().toISOString(),
          caption: 'Whiteboard notes',
          people: ['team'],
        }],
      };
    default:
      return {};
  }
}

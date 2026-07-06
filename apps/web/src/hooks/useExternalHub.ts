import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';
import { useShouldUseMockData } from './useShouldUseMockData';

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
  const isMock = useShouldUseMockData();
  const [sources, setSources] = useState<ExternalSourceStatus[]>([]);
  const [timeline, setTimeline] = useState<ExternalTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMock) {
        // Mock X integration status for demo
        const mockSources: ExternalSourceStatus[] = [
          { source: 'github', connected: true, lastSync: new Date(Date.now() - 1000*60*60).toISOString() },
          { source: 'instagram', connected: false, lastSync: null },
          { source: 'x', connected: true, lastSync: new Date(Date.now() - 1000*60*60*2).toISOString() },
          { source: 'calendar', connected: true, lastSync: new Date(Date.now() - 1000*60*30).toISOString() },
          { source: 'photos', connected: false, lastSync: null },
        ];
        const mockTimeline: ExternalTimelineEntry[] = [
          { source: 'x', timestamp: new Date(Date.now() - 1000*60*60*5).toISOString(), type: 'post', text: 'Just finished an amazing hike in the mountains. The views were breathtaking! #nature', summary: 'Hike in mountains', tags: ['x-import', 'nature'] },
          { source: 'x', timestamp: new Date(Date.now() - 1000*60*60*24).toISOString(), type: 'post', text: 'Working on a new project called LoreBook. Super excited about the AI memory features.', summary: 'LoreBook project update', tags: ['x-import', 'work'] },
          { source: 'github', timestamp: new Date(Date.now() - 1000*60*60*3).toISOString(), type: 'commit', text: 'feat: add mock X support in demo', summary: 'Added demo X integration', tags: ['github'] },
        ];
        setSources(mockSources);
        setTimeline(mockTimeline);
        setLoading(false);
        return;
      }
      const data = await fetchJson<{ sources: ExternalSourceStatus[]; timeline: ExternalTimelineEntry[] }>('/api/external-hub/status');
      setSources(data.sources ?? []);
      setTimeline(data.timeline ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration status');
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  const ingest = useCallback(
    async (source: ExternalSource, payload?: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        if (isMock) {
          // Simulate ingest in demo - add mock X post
          if (source === 'x') {
            const newPost: ExternalTimelineEntry = {
              source: 'x',
              timestamp: new Date().toISOString(),
              type: 'post',
              text: 'Demo sync: Just added another mock X post to show integration.',
              summary: 'Demo X sync post',
              tags: ['x-import', 'demo'],
            };
            setTimeline(prev => [newPost, ...prev].slice(0, 10));
            // Update last sync for X
            setSources(prev => prev.map(s => s.source === 'x' ? { ...s, lastSync: new Date().toISOString() } : s));
          }
          await new Promise(r => setTimeout(r, 400));
          setLoading(false);
          return;
        }
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
    [refresh, isMock]
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
      return {};
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

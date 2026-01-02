import { fetchJson } from '../lib/api';

export type TimelineLayer = 'events' | 'tasks' | 'arcs' | 'identity' | 'drift' | 'tags' | 'voiceMemos';

export type TimelineEvent = {
  id: string;
  title: string;
  timestamp: string;
  layer: TimelineLayer;
  summary?: string;
  tags?: string[];
};

export type TimelineResponse = {
  events: TimelineEvent[];
  arcs: { id: string; name: string; color: string }[];
  driftAlerts: { id: string; message: string; severity: 'low' | 'medium' | 'high' }[];
};

export const fetchTimeline = () => fetchJson<{ timeline: TimelineResponse }>('/api/timeline/omni');

export const fetchArcSummaries = () => fetchJson<{ arcs: { id: string; title: string; confidence?: number }[] }>('/api/timeline/arcs');

export const fetchIdentityShifts = () =>
  fetchJson<{ shifts: { id: string; description: string; occurred_at: string }[] }>('/api/timeline/identity');

import { fetchJson } from '../lib/api';
import type {
  Timeline,
  TimelineMembership,
  ChronologyEntry,
  ChronologyOverlap,
  TimeBucket,
  TimelineRelationship,
  TimelineSearchResult,
  CreateTimelinePayload,
  UpdateTimelinePayload,
  CreateMembershipPayload,
  CreateRelationshipPayload,
  SearchFilters,
  SearchMode
} from '../types/timelineV2';

// Timeline CRUD
export const fetchTimelines = (filters?: {
  timeline_type?: string;
  parent_id?: string | null;
  search?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.timeline_type) params.append('timeline_type', filters.timeline_type);
  if (filters?.parent_id !== undefined) params.append('parent_id', filters.parent_id || 'null');
  if (filters?.search) params.append('search', filters.search);

  return fetchJson<{ timelines: Timeline[] }>(`/api/timeline-v2?${params.toString()}`);
};

export const fetchTimeline = (id: string) =>
  fetchJson<{ timeline: Timeline }>(`/api/timeline-v2/${id}`);

export const createTimeline = (payload: CreateTimelinePayload) =>
  fetchJson<{ timeline: Timeline }>('/api/timeline-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

export const updateTimeline = (id: string, payload: UpdateTimelinePayload) =>
  fetchJson<{ timeline: Timeline }>(`/api/timeline-v2/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

export const deleteTimeline = (id: string) =>
  fetchJson<void>(`/api/timeline-v2/${id}`, { method: 'DELETE' });

// Timeline Memberships
export const addMemoryToTimeline = (timelineId: string, payload: CreateMembershipPayload) =>
  fetchJson<{ membership: TimelineMembership }>(`/api/timeline-v2/${timelineId}/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

export const fetchTimelineMemberships = (timelineId: string, limit?: number) => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  return fetchJson<{ memberships: TimelineMembership[] }>(
    `/api/timeline-v2/${timelineId}/memberships?${params.toString()}`
  );
};

export const fetchTimelineEntries = (timelineId: string, limit?: number) => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  return fetchJson<{ entries: Array<Record<string, unknown> & { membership?: TimelineMembership }> }>(
    `/api/timeline-v2/${timelineId}/entries?${params.toString()}`
  );
};

export const removeMemoryFromTimeline = (timelineId: string, entryId: string) =>
  fetchJson<void>(`/api/timeline-v2/${timelineId}/memberships/${entryId}`, { method: 'DELETE' });

// Timeline Search
export const searchTimelines = (query: string, mode: SearchMode = 'natural', filters?: SearchFilters) => {
  const params = new URLSearchParams();
  params.append('q', query);
  params.append('mode', mode);
  
  if (filters?.timeline_type) {
    filters.timeline_type.forEach(t => params.append('timeline_type', t));
  }
  if (filters?.emotion) {
    filters.emotion.forEach(e => params.append('emotion', e));
  }
  if (filters?.year_from) params.append('year_from', filters.year_from.toString());
  if (filters?.year_to) params.append('year_to', filters.year_to.toString());
  if (filters?.tags) {
    filters.tags.forEach(t => params.append('tags', t));
  }
  // Add layer type filtering for 9-layer hierarchy
  if (filters?.layer_type) {
    filters.layer_type.forEach(l => params.append('layer_type', l));
  }

  return fetchJson<TimelineSearchResult>(`/api/timeline-v2/search?${params.toString()}`);
};

// Timeline Relationships
export const fetchRelatedTimelines = (timelineId: string) =>
  fetchJson<{ relationships: TimelineRelationship[] }>(`/api/timeline-v2/${timelineId}/related`);

export const createTimelineRelationship = (timelineId: string, payload: CreateRelationshipPayload) =>
  fetchJson<{ relationship: TimelineRelationship }>(`/api/timeline-v2/${timelineId}/relationships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

// Chronology
export const fetchChronology = (startTime?: string, endTime?: string, timelineIds?: string[]) => {
  const params = new URLSearchParams();
  if (startTime) params.append('start_time', startTime);
  if (endTime) params.append('end_time', endTime);
  if (timelineIds && timelineIds.length > 0) {
    timelineIds.forEach(id => params.append('timeline_ids', id));
  }
  return fetchJson<{ entries: ChronologyEntry[] }>(`/api/chronology?${params.toString()}`);
};

export const fetchChronologyOverlaps = (entryId?: string) => {
  const params = new URLSearchParams();
  if (entryId) params.append('entry_id', entryId);
  return fetchJson<{ overlaps: ChronologyOverlap[] }>(`/api/chronology/overlaps?${params.toString()}`);
};

export const fetchTimeBuckets = (resolution: 'decade' | 'year' | 'month' = 'year') =>
  fetchJson<{ buckets: TimeBucket[] }>(`/api/chronology/buckets?resolution=${resolution}`);

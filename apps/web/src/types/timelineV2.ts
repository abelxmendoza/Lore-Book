/**
 * Timeline V2 Types
 * Flexible timeline system with multiple memberships and chronology support
 */

export type TimelineType = 'life_era' | 'sub_timeline' | 'skill' | 'location' | 'work' | 'custom';

export type TimePrecision = 'exact' | 'day' | 'month' | 'year' | 'approximate';

export type SearchMode = 'natural' | 'faceted' | 'semantic';

export type RelationshipType = 'spawned' | 'influenced' | 'overlapped' | 'preceded' | 'merged' | 'split';

export interface Timeline {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  timeline_type: TimelineType;
  parent_id?: string | null;
  start_date: string;
  end_date?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  children?: Timeline[];
  member_count?: number;
}

export interface TimelineMembership {
  id: string;
  user_id: string;
  journal_entry_id: string;
  timeline_id: string;
  role?: string | null;
  importance_score: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChronologyEntry {
  id: string;
  user_id: string;
  journal_entry_id: string;
  start_time: string;
  end_time?: string | null;
  time_precision: TimePrecision;
  time_confidence: number;
  content: string;
  timeline_memberships: string[]; // Timeline IDs
  timeline_names?: string[]; // Timeline names (optional, populated by backend)
}

export interface ChronologyOverlap {
  entry1_id: string;
  entry2_id: string;
  overlap_start: string;
  overlap_end: string;
  overlap_duration_days: number;
}

export interface ChronologyConstraint {
  type: 'impossible_overlap' | 'contradiction' | 'gap' | 'precision_mismatch';
  entry_id?: string;
  entry_ids?: string[];
  message: string;
  severity: 'warning' | 'error';
}

export interface TimeBucket {
  year?: number;
  month?: string; // YYYY-MM format
  decade?: number;
  entry_count: number;
  entries: ChronologyEntry[];
}

export interface TimelineRelationship {
  id: string;
  user_id: string;
  source_timeline_id: string;
  target_timeline_id: string;
  relationship_type: RelationshipType;
  description?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SearchFilters {
  timeline_type?: string[];
  era?: string[];
  skill?: string[];
  job?: string[];
  location?: string[];
  emotion?: string[];
  year_from?: number;
  year_to?: number;
  tags?: string[];
}

export interface SearchResult {
  timeline: Timeline;
  memories: Array<{
    id: string;
    content: string;
    date: string;
    tags: string[];
    mood?: string | null;
  }>;
  relevance_score?: number;
}

export interface TimelineSearchResult {
  results: SearchResult[];
  total_count: number;
  search_mode: SearchMode;
}

export interface CreateTimelinePayload {
  title: string;
  description?: string;
  timeline_type: TimelineType;
  parent_id?: string | null;
  start_date: string;
  end_date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTimelinePayload {
  title?: string;
  description?: string;
  timeline_type?: TimelineType;
  parent_id?: string | null;
  start_date?: string;
  end_date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateMembershipPayload {
  journal_entry_id: string;
  timeline_id: string;
  role?: string;
  importance_score?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateRelationshipPayload {
  source_timeline_id: string;
  target_timeline_id: string;
  relationship_type: RelationshipType;
  description?: string;
  metadata?: Record<string, unknown>;
}

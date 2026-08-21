import { fetchJson } from '../lib/api';

export type StitchedItemKind = 'moment' | 'event';

export type CanonicalTemporalModel = {
  occurred: {
    start: string | null;
    end: string | null;
    precision: string;
    source: string;
    status: string;
    confidence: number;
    expression: string | null;
    timezone: string | null;
  };
  mentionedAt: string | null;
  recordedAt: string | null;
  knownFrom: string | null;
  validFrom: string | null;
  validUntil: string | null;
  provenance: Array<{
    field: string;
    source: string;
    sourceId?: string | null;
    expression?: string | null;
  }>;
};

export type TemporalSurfaceProjection = {
  canonicalItemId: string;
  occurredStart: string | null;
  occurredEnd: string | null;
  userLocalStartDay: string | null;
  userLocalEndDay: string | null;
  timezone: string | null;
  precision: string;
  occurrenceStatus: 'confirmed' | 'range' | 'unresolved';
  temporalState: 'past' | 'ongoing' | 'future' | 'unresolved';
  isRange: boolean;
  isAllDay: boolean;
  isTimed: boolean;
  isUnresolved: boolean;
  calendarPlacement: 'day' | 'unscheduled';
  displayWarnings: string[];
};

export type StitchedTimelineItem = {
  id: string;
  kind: StitchedItemKind;
  sourceId: string;
  sortTime: string;
  userSortIndex: number | null;
  title: string;
  body: string;
  confidence?: number;
  sourceKind: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceIds: string[];
  sourceType: string;
  tags?: string[];
  userPresence?: 'attended' | 'heard_about' | 'unknown';
  temporalRole?: string;
  /** Narrative cohesion score vs. the arc's anchor (0–100), when gated. */
  cohesion?: number;
  /** Contribution to the chapter thesis (0–100). */
  contribution?: number;
  /** Number of extracted duplicates collapsed into this canonical event. */
  mergedCount?: number;
  /** Titles of the merged-away duplicates (excludes the shown title). */
  mergedTitles?: string[];
  /** Chronology Authority temporal honesty fields. */
  timePrecision?: string;
  timeConfidence?: number;
  temporalSource?: string;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  projectionRole?: 'canonical' | 'evidence' | 'unresolved' | 'excluded';
  canonicalEventType?: string;
  speechAct?: string;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  knownFrom?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  temporal?: CanonicalTemporalModel;
  temporalProjection?: TemporalSurfaceProjection;
};

export type NarrativeChapterQuality = {
  narrativeCoherence?: number;
  topicPurity?: number;
  chronologicalFlow?: number;
  characterConsistency?: number;
  locationConsistency?: number;
  goalConsistency?: number;
  emotionalConsistency?: number;
  redundancy?: number;
  overallStoryQuality?: number;
};

export type NarrativeChapter = {
  title: string;
  thesis: string;
  dominantTheme: string;
  startDate: string | null;
  endDate: string | null;
  participants: string[];
  locations: string[];
  supportingEventIds: string[];
  backgroundEventIds: string[];
  backgroundContext: string[];
  outcomes: string[];
  contributionScores: Record<string, number>;
  quality: NarrativeChapterQuality;
  confidence: number;
};

export type MergeLogEntry = {
  canonical_id: string;
  canonical_title: string;
  merged_ids: string[];
  merged_titles: string[];
};

export type StitchedTimelineResult = {
  scope_type: 'global' | 'life_arc';
  scope_id: string;
  scope_label: string | null;
  items: StitchedTimelineItem[];
  has_user_order: boolean;
  /** Persistent-state facts from the same period — context, not scene events. */
  background?: StitchedTimelineItem[];
  /** Same-window items dropped for lacking narrative cohesion with the scene. */
  excluded_count?: number;
  /** Duplicate-event merges applied before stitching (canonicalization). */
  merge_log?: MergeLogEntry[];
  chapter?: NarrativeChapter;
  /** Temporally unresolved items for the Omni tray. */
  unresolved_items?: StitchedTimelineItem[];
  evidence_hidden_count?: number;
  temporal_relations?: Array<{
    id: string;
    sourceId: string | null;
    sourceLabel: string;
    targetId: string | null;
    targetLabel: string;
    relation: 'BEFORE' | 'AFTER' | 'OVERLAPS' | 'DURING' | 'CONTAINS' | 'STARTS_NEAR' | 'ENDS_NEAR' | 'SAME_PERIOD_AS';
    confidence: number;
    evidencePhrase: string;
    sourceMessageId: string;
    sourceAssertionIds: string[];
  }>;
  historical_neighborhoods?: Array<{
    id: string;
    label: string;
    start: string;
    end: string;
    precision: 'year';
    tracks: Array<{ id: string; label: string; itemIds: string[] }>;
    relationIds: string[];
  }>;
};

export const stitchedTimelineApi = {
  get: (params?: {
    life_arc_id?: string;
    start_time?: string;
    end_time?: string;
    scope_type?: 'global' | 'life_arc';
    /** Restrict the global scope to events involving this character. */
    character_id?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.life_arc_id) qs.set('life_arc_id', params.life_arc_id);
    if (params?.start_time) qs.set('start_time', params.start_time);
    if (params?.end_time) qs.set('end_time', params.end_time);
    if (params?.scope_type) qs.set('scope_type', params.scope_type);
    if (params?.character_id) qs.set('character_id', params.character_id);
    const query = qs.toString();
    return fetchJson<StitchedTimelineResult>(
      `/api/chronology/stitched${query ? `?${query}` : ''}`
    );
  },

  saveOrder: (body: {
    scope_type: 'global' | 'life_arc';
    scope_id?: string;
    items: Array<{ kind: StitchedItemKind; id: string; sort_index: number }>;
  }) =>
    fetchJson<{ success: boolean; saved: number }>('/api/chronology/order', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

/**
 * Backward-Storytelling–Safe Narrative Ingestion
 * Types for segmenting narrative, inferring story time, and materializing entries.
 * Never equate "said first" with "happened first".
 */

export type NarrativeSegment = {
  segment_id: string;
  text: string;
  narrative_order: number; // order user told it (1-based)
  temporal_markers: string[]; // "before", "after", "that year", "over the summer"
};

export type TemporalRelation = 'before' | 'after' | 'during';

/** Relation between segments (for thread/arc wiring when materializing arcs) */
export type StoryTimeRelation = {
  type: 'paused_by' | 'parallel_to';
  target_segment_id: string;
};

export type StoryTimeInference = {
  segment_id: string;
  start_date?: string; // ISO date
  end_date?: string; // ISO date
  relative_to?: string; // segment_id this is relative to
  relation?: TemporalRelation;
  confidence: number;
  reasoning: string;
  /** Optional thread names (e.g. ["Omega1","Robotics"]) for arc→thread membership when creating arcs */
  threads?: string[];
  /** Optional relations to other segments when creating arcs */
  relations?: StoryTimeRelation[];
};

/** Known life anchors (graduation, job start, etc.) for resolving relative dates */
export type LifeAnchor = {
  id: string;
  label: string;
  date: string; // ISO
  type?: 'graduation' | 'job_start' | 'job_end' | 'move' | 'relationship_start' | 'other';
};

export type LifeAnchors = {
  anchors?: LifeAnchor[];
};

/** Materialized unit — becomes a normal journal entry */
export type StorySlice = {
  entry_id: string;
  content: string;
  date: string; // ISO — "when it happened"
  narrative_order: number;
  source: 'chat' | 'journal';
  derived_from_entry_id?: string;
  segment_id: string;
  inference_confidence?: number;
};

/** Context passed to story-time inference */
export type StoryTimeContext = {
  knownAnchors?: LifeAnchors;
  previousEntries?: Array<{ id: string; date: string; content: string; summary?: string | null }>;
  sourceTimestamp?: string; // when the user said it (e.g. chat timestamp)
  /** When set, pipeline will create arcs under this saga and wire threads/relations (optional step) */
  parentSagaId?: string;
};

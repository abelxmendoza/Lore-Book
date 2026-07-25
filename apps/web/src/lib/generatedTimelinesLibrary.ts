import type { GeneratedTimelineEvent } from '../components/timeline/GeneratedTimelineReveal';
import type {
  SubjectRelation,
  SubjectTimelineCompilationSummary,
  SubjectTimelinePhase,
} from '../api/subjectTimeline';

export type StoredTimelineEvent = {
  id: string;
  start_time: string;
  content: string;
  timeline_names?: string[];
  significance?: 'low' | 'medium' | 'high';
  stateChange?: string;
  title?: string;
  source_kind?: 'journal_entry' | 'resolved_event' | 'timeline_event';
  source_id?: string;
  source_ids?: string[];
  source_type?: string;
  time_precision?: string;
  time_confidence?: number;
  occurrence_status?: 'confirmed' | 'range' | 'unresolved';
  phase?: SubjectTimelinePhase;
  subjectRelation?: SubjectRelation;
  relevance?: number;
  evidenceCount?: number;
  whyIncluded?: string;
  focusedEvidence?: string;
};

export type SavedGeneratedTimeline = {
  id: string;
  query: string;
  queryKey: string;
  events: StoredTimelineEvent[];
  arcTitles: string[];
  isMock: boolean;
  collapsed: boolean;
  compilation?: SubjectTimelineCompilationSummary;
  createdAt: string;
  updatedAt: string;
};

export const GENERATED_TIMELINES_STORAGE_KEY = 'lorekeeper_generated_timelines_v1';

export function normalizeTimelineQueryKey(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function serializeTimelineEvent(event: GeneratedTimelineEvent): StoredTimelineEvent {
  return {
    id: event.id,
    start_time: event.start_time,
    content: event.content ?? '',
    timeline_names: event.timeline_names,
    ...('title' in event && event.title ? { title: event.title } : {}),
    ...('stateChange' in event && event.stateChange ? { stateChange: event.stateChange } : {}),
    ...('significance' in event && event.significance ? { significance: event.significance } : {}),
    ...('source_kind' in event && event.source_kind ? { source_kind: event.source_kind } : {}),
    ...('source_id' in event && event.source_id ? { source_id: event.source_id } : {}),
    ...('source_ids' in event && event.source_ids ? { source_ids: event.source_ids } : {}),
    ...('source_type' in event && event.source_type ? { source_type: event.source_type } : {}),
    ...('time_precision' in event && event.time_precision ? { time_precision: event.time_precision } : {}),
    ...('time_confidence' in event && typeof event.time_confidence === 'number'
      ? { time_confidence: event.time_confidence }
      : {}),
    ...('occurrence_status' in event && event.occurrence_status
      ? { occurrence_status: event.occurrence_status }
      : {}),
    ...('phase' in event && event.phase ? { phase: event.phase } : {}),
    ...('subjectRelation' in event && event.subjectRelation
      ? { subjectRelation: event.subjectRelation }
      : {}),
    ...('relevance' in event && typeof event.relevance === 'number'
      ? { relevance: event.relevance }
      : {}),
    ...('evidenceCount' in event && typeof event.evidenceCount === 'number'
      ? { evidenceCount: event.evidenceCount }
      : {}),
    ...('whyIncluded' in event && event.whyIncluded
      ? { whyIncluded: event.whyIncluded }
      : {}),
    ...('focusedEvidence' in event && event.focusedEvidence
      ? { focusedEvidence: event.focusedEvidence }
      : {}),
  };
}

export function findTimelineByQuery(
  library: SavedGeneratedTimeline[],
  query: string
): SavedGeneratedTimeline | undefined {
  const key = normalizeTimelineQueryKey(query);
  return library.find((t) => t.queryKey === key);
}

export function upsertGeneratedTimeline(
  library: SavedGeneratedTimeline[],
  input: {
    query: string;
    events: GeneratedTimelineEvent[];
    isMock: boolean;
    arcTitles?: string[];
    preserveCollapsed?: boolean;
    /** Explicit collapse state (wins over preserveCollapsed). */
    collapsed?: boolean;
    compilation?: SubjectTimelineCompilationSummary;
    existingId?: string;
  }
): { library: SavedGeneratedTimeline[]; saved: SavedGeneratedTimeline } {
  const now = new Date().toISOString();
  const queryKey = normalizeTimelineQueryKey(input.query);
  const existing = input.existingId
    ? library.find((t) => t.id === input.existingId)
    : library.find((t) => t.queryKey === queryKey);

  const collapsed =
    typeof input.collapsed === 'boolean'
      ? input.collapsed
      : input.preserveCollapsed
        ? (existing?.collapsed ?? false)
        : false;

  const saved: SavedGeneratedTimeline = {
    id: existing?.id ?? crypto.randomUUID(),
    query: input.query.trim(),
    queryKey,
    events: input.events.map(serializeTimelineEvent),
    arcTitles: input.arcTitles ?? existing?.arcTitles ?? [],
    isMock: input.isMock,
    collapsed,
    compilation: input.compilation ?? existing?.compilation,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const without = library.filter((t) => t.id !== saved.id && t.queryKey !== queryKey);
  return { library: [saved, ...without].slice(0, 40), saved };
}

export function removeGeneratedTimeline(
  library: SavedGeneratedTimeline[],
  id: string
): SavedGeneratedTimeline[] {
  return library.filter((t) => t.id !== id);
}

export function toggleTimelineCollapsed(
  library: SavedGeneratedTimeline[],
  id: string
): SavedGeneratedTimeline[] {
  return library.map((t) =>
    t.id === id ? { ...t, collapsed: !t.collapsed, updatedAt: new Date().toISOString() } : t
  );
}

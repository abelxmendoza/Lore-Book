import { fetchJson } from '../lib/api';

export type SubjectTimelineMode =
  | 'SUBJECT_TIMELINE'
  | 'EMPLOYMENT_TIMELINE'
  | 'RELATIONSHIP_TIMELINE'
  | 'PROJECT_TIMELINE'
  | 'PLACE_TIMELINE'
  | 'DATE_TIMELINE'
  | 'EVIDENCE_SEARCH';

export type SubjectTimelinePhase =
  | 'prelude'
  | 'beginning'
  | 'active_period'
  | 'turning_point'
  | 'transition'
  | 'aftermath'
  | 'related_context';

export type SubjectRelation =
  | 'DIRECT_PERIOD'
  | 'DIRECT_EVENT'
  | 'DIRECT_WORK_ACTIVITY'
  | 'PREPARATION'
  | 'TRANSITION'
  | 'AFTERMATH'
  | 'SUBJECT_ASSOCIATION'
  | 'INCIDENTAL_MENTION';

export type TimelineEntityType =
  | 'person'
  | 'organization'
  | 'place'
  | 'group'
  | 'community'
  | 'skill'
  | 'event'
  | 'project';

export type ResolvedTimelineSubject = {
  entityId: string;
  entityType: TimelineEntityType;
  displayName: string;
  aliases: string[];
  confidence: number;
  matchKind?: 'exact' | 'alias' | 'fuzzy';
};

export type CompiledTimelineEvent = {
  id: string;
  start_time: string;
  end_time?: string | null;
  title: string;
  content: string;
  timeline_names: string[];
  source_kind: 'journal_entry' | 'resolved_event' | 'timeline_event';
  source_id: string;
  source_ids: string[];
  source_type: string;
  time_precision: string;
  time_confidence: number;
  occurrence_status?: 'confirmed' | 'range' | 'unresolved';
  phase: SubjectTimelinePhase;
  subjectRelation: SubjectRelation;
  relevance: number;
  significance: 'low' | 'medium' | 'high';
  evidenceCount: number;
  whyIncluded: string;
  focusedEvidence: string;
};

export type SubjectTimelineCompilationSummary = {
  intent: {
    rawQuery: string;
    mode: SubjectTimelineMode;
    subjectQuery: string;
    perspective:
      | 'FIRST_PERSON_EXPERIENCE'
      | 'RELATIONSHIP_HISTORY'
      | 'PROJECT_EVOLUTION'
      | 'ALL_RELEVANT';
    expectedPhases: SubjectTimelinePhase[];
    exactDate?: string;
  };
  subject: ResolvedTimelineSubject | null;
  ambiguity: ResolvedTimelineSubject[];
  period: {
    start: string;
    end: string;
    label: string;
  } | null;
  coverage: {
    score: number;
    coveredPhases: SubjectTimelinePhase[];
    missingPhases: SubjectTimelinePhase[];
    isComplete: boolean;
  };
  sources: string[];
  warnings: string[];
  contextEvents: CompiledTimelineEvent[];
};

export type SubjectTimelineCompilation = SubjectTimelineCompilationSummary & {
  query: string;
  events: CompiledTimelineEvent[];
};

export const subjectTimelineApi = {
  compile: (
    query: string,
    subject?: {
      entityId: string;
      entityType: TimelineEntityType;
    },
  ) =>
    fetchJson<SubjectTimelineCompilation>('/api/search/timeline', {
      method: 'POST',
      body: JSON.stringify({ query, subject }),
    }),
};

export function compilationSummary(
  compilation: SubjectTimelineCompilation,
): SubjectTimelineCompilationSummary {
  const { events: _, query: _query, ...summary } = compilation;
  return summary;
}

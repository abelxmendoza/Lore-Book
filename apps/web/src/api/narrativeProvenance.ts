import { fetchJson } from '../lib/api';

export type NarrativeClaimKind = 'fact' | 'event' | 'evidence' | 'interpretation' | 'meaning' | 'decision';

export type NarrativeClaimRelation =
  | 'evidences'
  | 'interpreted_as'
  | 'means_for'
  | 'derived_from'
  | 'contradicts'
  | 'supersedes'
  | 'caused'
  | 'led_to';

export type NarrativeSourceTable =
  | 'entry_ir'
  | 'resolved_events'
  | 'crystallized_knowledge'
  | 'event_interpretations'
  | 'utterances'
  | 'conversation_messages'
  | 'journal_entries';

export type NarrativeClaimView = {
  id: string;
  kind: NarrativeClaimKind;
  statement: string;
  summary: string | null;
  confidence: number;
  status: string;
  sourceTable: string | null;
  sourceId: string | null;
  occurredAt: string | null;
  occurredEnd: string | null;
  significance: number | null;
  createdAt: string;
  legacy?: {
    table: string;
    id: string;
    title: string;
    excerpt: string | null;
    occurredAt: string | null;
    extra?: Record<string, unknown>;
  } | null;
};

export type NarrativeClaimEdgeView = {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  relation: NarrativeClaimRelation;
  confidence: number;
};

export type NarrativeProvenanceChainStep = {
  claim: NarrativeClaimView;
  relation: NarrativeClaimRelation | 'root';
  viaEdgeId: string | null;
  depth: number;
};

export type NarrativeProvenanceReport = {
  claim: NarrativeClaimView;
  upstream: NarrativeClaimView[];
  downstream: NarrativeClaimView[];
  edges: NarrativeClaimEdgeView[];
  chain: NarrativeProvenanceChainStep[];
  summary: {
    factCount: number;
    eventCount: number;
    evidenceCount: number;
    interpretationCount: number;
    meaningCount: number;
    oldestEvidenceAt: string | null;
    depth: number;
  };
};

export const narrativeProvenanceApi = {
  getByClaimId: (claimId: string) =>
    fetchJson<NarrativeProvenanceReport>(`/api/narrative/provenance/${claimId}`),

  lookupBySource: (sourceTable: NarrativeSourceTable, sourceId: string) => {
    const qs = new URLSearchParams({ sourceTable, sourceId });
    return fetchJson<NarrativeProvenanceReport>(`/api/narrative/provenance/lookup?${qs}`);
  },
};

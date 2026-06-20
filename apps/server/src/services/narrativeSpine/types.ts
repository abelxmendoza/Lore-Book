/** Epistemic kinds — never collapse these into one object. */
export type NarrativeClaimKind =
  | 'fact'
  | 'event'
  | 'evidence'
  | 'interpretation'
  | 'meaning'
  | 'decision';

export type EpistemicState =
  | 'UNKNOWN'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERIFIED'
  | 'CONTRADICTED'
  | 'DEPRECATED';

export type NarrativeClaimStatus = 'active' | 'superseded' | 'disputed' | 'archived';

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
  | 'knowledge_evidence_links'
  | 'journal_entries';

export interface NarrativeClaimRow {
  id: string;
  user_id: string;
  claim_kind: NarrativeClaimKind;
  statement: string;
  summary: string | null;
  machine_key: string | null;
  confidence: number;
  status: NarrativeClaimStatus;
  source_table: string | null;
  source_id: string | null;
  occurred_at: string | null;
  occurred_end: string | null;
  significance: number | null;
  epistemic_state: EpistemicState;
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string;
  asserted_at: string;
  extraction_method: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NarrativeClaimEdgeRow {
  id: string;
  user_id: string;
  from_claim_id: string;
  to_claim_id: string;
  relation: NarrativeClaimRelation;
  confidence: number;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface UpsertNarrativeClaimInput {
  claimKind: NarrativeClaimKind;
  statement: string;
  summary?: string | null;
  machineKey?: string | null;
  confidence?: number;
  status?: NarrativeClaimStatus;
  sourceTable?: NarrativeSourceTable | null;
  sourceId?: string | null;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  significance?: number | null;
  epistemicState?: EpistemicState;
  validFrom?: string | null;
  validTo?: string | null;
  extractionMethod?: string | null;
  meta?: Record<string, unknown>;
}

export interface NarrativeClaimView {
  id: string;
  kind: NarrativeClaimKind;
  statement: string;
  summary: string | null;
  confidence: number;
  status: NarrativeClaimStatus;
  sourceTable: string | null;
  sourceId: string | null;
  occurredAt: string | null;
  occurredEnd: string | null;
  significance: number | null;
  createdAt: string;
  legacy?: LegacyArtifactSnippet | null;
}

export interface NarrativeClaimEdgeView {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  relation: NarrativeClaimRelation;
  confidence: number;
}

export interface LegacyArtifactSnippet {
  table: string;
  id: string;
  title: string;
  excerpt: string | null;
  occurredAt: string | null;
  extra?: Record<string, unknown>;
}

export interface NarrativeProvenanceReport {
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
}

export interface NarrativeProvenanceChainStep {
  claim: NarrativeClaimView;
  relation: NarrativeClaimRelation | 'root';
  viaEdgeId: string | null;
  depth: number;
}

export interface SourceRef {
  sourceTable: NarrativeSourceTable;
  sourceId: string;
}

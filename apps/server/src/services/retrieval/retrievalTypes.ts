import type { TruthState } from '../truthState/truthStateTypes';

export type RetrievalTruthRank =
  | 'confirmed'
  | 'user_stated'
  | 'repeated_candidate'
  | 'inferred'
  | 'review_only';

export type RetrievalMemoryKind =
  | 'journal_entry'
  | 'entity_profile'
  | 'relationship'
  | 'narrative_anchor'
  | 'timeline_event'
  | 'status'
  | 'claim';

export type RetrievalProvenance = {
  sourceMessageId?: string;
  sourceQuote: string;
  truthState: TruthState;
  confidence: number;
  evidenceBundleId?: string;
};

export type RetrievalEntityRef = {
  id: string;
  name: string;
  aliases: string[];
  entityType: 'character' | 'organization' | 'location' | 'group' | 'event';
};

export type RetrievalAnchorRef = {
  id: string;
  title: string;
  anchorType: string;
  entityIds: string[];
  activities?: string[];
};

export type RetrievalMemoryRecord = {
  id: string;
  kind: RetrievalMemoryKind;
  text: string;
  entityIds: string[];
  entityNames: string[];
  anchorIds: string[];
  anchorTitles: string[];
  eraLabels: string[];
  relationshipLabels: string[];
  semanticScore: number;
  emotionalWeight: number;
  relationshipStrength: number;
  narrativeGravity: number;
  recencyScore: number;
  frequency: number;
  provenance: RetrievalProvenance;
  sensitiveCategories: string[];
  supersededById?: string;
  correctedFromId?: string;
  createdAt: string;
};

export type AmbiguousEntityCandidate = {
  entityId: string;
  name: string;
  aliases: string[];
  reason: string;
  confidence: number;
};

export type RetrievalQueryContext = {
  userId: string;
  query: string;
  threadId?: string;
  threadEntityIds?: string[];
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  limit?: number;
};

export type RetrievalScoreBreakdown = {
  semantic: number;
  entityMatch: number;
  anchorMatch: number;
  timelineMatch: number;
  relationshipMatch: number;
  emotional: number;
  narrativeGravity: number;
  recency: number;
  frequency: number;
  truthRank: number;
  provenanceConfidence: number;
  total: number;
};

export type RetrievedMemory = {
  record: RetrievalMemoryRecord;
  score: number;
  breakdown: RetrievalScoreBreakdown;
  provenance: RetrievalProvenance;
  carefulPhrasing: boolean;
  retrievalReasons: string[];
};

export type MemoryRetrievalResult = {
  memories: RetrievedMemory[];
  entities: RetrievalEntityRef[];
  anchors: RetrievalAnchorRef[];
  ambiguousEntities: AmbiguousEntityCandidate[];
  needsClarification: boolean;
  clarificationPrompt?: string;
  filteredRejected: number;
  filteredSuperseded: number;
  debug?: RetrievalDebugReport;
};

export type RetrievalDebugReport = {
  query: string;
  candidateCount: number;
  afterTruthFilter: number;
  afterRanking: number;
  topReasons: string[];
  truthRankDistribution: Record<string, number>;
  sensitiveCount: number;
};

export const TRUTH_RANK_WEIGHT: Record<RetrievalTruthRank, number> = {
  confirmed: 1.0,
  user_stated: 0.88,
  repeated_candidate: 0.78,
  inferred: 0.62,
  review_only: 0.45,
};

export function truthStateToRetrievalRank(
  truthState: TruthState,
  origin?: string,
  mentionCount = 1,
): RetrievalTruthRank {
  if (truthState === 'user_confirmed' || truthState === 'system_confirmed') return 'confirmed';
  if (truthState === 'rejected' || truthState === 'archived') return 'review_only';
  if (truthState === 'inferred') return 'inferred';
  if (truthState === 'review_required' || truthState === 'observed' || truthState === 'contradicted') {
    return 'review_only';
  }
  if (truthState === 'candidate') {
    if (origin === 'explicit_user' || origin === 'user_corrected' || origin === 'manual_edit') {
      return mentionCount >= 2 ? 'repeated_candidate' : 'user_stated';
    }
    return mentionCount >= 2 ? 'repeated_candidate' : 'inferred';
  }
  return 'review_only';
}

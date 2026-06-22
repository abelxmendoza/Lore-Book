export type ProvenanceSourceType =
  | 'user_message'
  | 'assistant_response'
  | 'system_inference'
  | 'user_correction'
  | 'manual_edit'
  | 'imported_data';

export type ProvenanceClaimType =
  | 'entity'
  | 'relationship'
  | 'event'
  | 'status'
  | 'preference'
  | 'skill'
  | 'timeline'
  | 'identity'
  | 'inference';

export type ProvenanceOrigin =
  | 'explicit_user_statement'
  | 'implicit_user_statement'
  | 'assistant_generated'
  | 'system_inferred'
  | 'user_confirmed'
  | 'user_corrected';

export type ProvenanceTruthState =
  | 'candidate'
  | 'review'
  | 'confirmed'
  | 'contradicted'
  | 'rejected'
  | 'archived';

/** Receipt trail behind every durable memory — not a LoreBook card. */
export type EvidenceBundle = {
  id: string;
  sourceType: ProvenanceSourceType;
  sourceMessageId?: string;
  sourceThreadId?: string;
  sourceQuote: string;
  extractedSpanIds?: string[];
  parserFrameIds?: string[];
  claimText: string;
  claimType: ProvenanceClaimType;
  origin: ProvenanceOrigin;
  confidence: number;
  truthState: ProvenanceTruthState;
  createdAt: string;
  supersededById?: string;
  correctedFromId?: string;
};

export type CorrectionRecord = {
  id: string;
  oldClaimText: string;
  newClaimText: string;
  oldEvidenceId?: string;
  newEvidenceId: string;
  sourceType: ProvenanceSourceType;
  sourceMessageId?: string;
  sourceQuote: string;
  createdAt: string;
};

export type ContradictionConflictType =
  | 'name_mismatch'
  | 'relationship_conflict'
  | 'status_conflict'
  | 'timeline_conflict'
  | 'preference_conflict'
  | 'generic_conflict';

export type ContradictionRecord = {
  id: string;
  oldEvidenceId: string;
  newEvidenceId: string;
  oldClaimText: string;
  newClaimText: string;
  conflictType: ContradictionConflictType;
  requiresReview: true;
  createdAt: string;
};

export type ProvenanceInferenceInput = {
  text: string;
  sourceMessageId?: string;
  sourceThreadId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  sourceType?: ProvenanceSourceType;
  priorBundles?: EvidenceBundle[];
  priorCorrections?: CorrectionRecord[];
  priorContradictions?: ContradictionRecord[];
  seenAt?: string;
  /** UI-driven edit — highest authority. */
  manualEdit?: {
    claimText: string;
    claimType: ProvenanceClaimType;
    sourceQuote?: string;
    confirmed?: boolean;
  };
  userConfirmed?: boolean;
};

export type ProvenanceInferenceResult = {
  accepted: EvidenceBundle[];
  rejected: Array<{ claimText: string; reason: string }>;
  corrections: CorrectionRecord[];
  contradictions: ContradictionRecord[];
  /** Append-only history including superseded and contradicted bundles. */
  bundleHistory: EvidenceBundle[];
};

export type ClaimCandidate = {
  claimText: string;
  claimType: ProvenanceClaimType;
  origin: ProvenanceOrigin;
  sourceQuote: string;
  confidence: number;
  inferredSubject?: string;
};

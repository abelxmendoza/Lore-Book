export type AssertionClass =
  | 'observation'
  | 'experience'
  | 'statement'
  | 'belief'
  | 'hypothesis'
  | 'decision'
  | 'reflection';

export type AssertionDomain =
  | 'identity'
  | 'relationship'
  | 'emotion'
  | 'goal'
  | 'project'
  | 'skill'
  | 'preference'
  | 'location'
  | 'community'
  | 'career'
  | 'health'
  | 'event'
  | 'world';

export type EpistemicStance =
  | 'direct_observation'
  | 'reported_statement'
  | 'user_belief'
  | 'system_hypothesis'
  | 'established_knowledge';

export type AssertionStatus =
  | 'proposed'
  | 'active'
  | 'challenged'
  | 'superseded'
  | 'retracted'
  | 'rejected';

export type AssertionActorKind =
  | 'user'
  | 'lorebook'
  | 'external_person'
  | 'document_author'
  | 'imported_source'
  | 'unknown';

export type AssertionDerivationMethod =
  | 'directly_stated'
  | 'quoted'
  | 'extracted'
  | 'calculated'
  | 'inferred'
  | 'user_confirmed';

export type AssertionSensitivity =
  | 'standard'
  | 'sensitive'
  | 'high_impact'
  | 'restricted';

export type AssertionPolarity = 'affirmed' | 'uncertain' | 'negated';

export type EvidenceRelation =
  | 'supports'
  | 'challenges'
  | 'contextualizes'
  | 'duplicates'
  | 'irrelevant';

export type RevisionRelation =
  | 'supersedes'
  | 'corrects'
  | 'retracts'
  | 'narrows'
  | 'expands';

export type KernelSubjectRef = {
  kind: string;
  id?: string | null;
  label: string;
};

export type KernelActorRef = {
  kind: AssertionActorKind;
  id?: string | null;
  label?: string | null;
};

export type KnowledgeAssertionInput = {
  subject: KernelSubjectRef;
  predicate: string;
  objectValue: unknown;
  assertionClass: AssertionClass;
  domain: AssertionDomain;
  epistemicStance: EpistemicStance;
  assertedBy: KernelActorRef;
  derivationMethod: AssertionDerivationMethod;
  polarity?: AssertionPolarity;
  certainty?: number | null;
  status?: AssertionStatus;
  sensitivity?: AssertionSensitivity;
  validFrom?: string | null;
  validTo?: string | null;
  occurredAt?: string | null;
  recordedAt?: string;
  extractionMethod?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type KnowledgeAssertionRow = {
  id: string;
  user_id: string;
  subject_kind: string;
  subject_id: string | null;
  subject_label: string;
  predicate: string;
  object_value: unknown;
  assertion_class: AssertionClass;
  domain: AssertionDomain;
  epistemic_stance: EpistemicStance;
  asserted_by_kind: AssertionActorKind;
  asserted_by_id: string | null;
  asserted_by_label: string | null;
  derivation_method: AssertionDerivationMethod;
  polarity: AssertionPolarity;
  certainty: number | null;
  status: AssertionStatus;
  sensitivity: AssertionSensitivity;
  valid_from: string | null;
  valid_to: string | null;
  occurred_at: string | null;
  recorded_at: string;
  extraction_method: string | null;
  source_table: string | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AssertionEvidenceLinkInput = {
  assertionId: string;
  evidenceKind: string;
  evidenceId: string;
  relation: EvidenceRelation;
  weight?: number;
  excerpt?: string | null;
  locator?: Record<string, unknown>;
  linkedBy?: 'user' | 'system' | 'import';
  rationale?: string | null;
  extractionConfidence?: number | null;
};

export type ReportedClaimPairInput = {
  reporter: KernelActorRef & { label: string };
  subject: KernelSubjectRef;
  predicate: string;
  objectValue: unknown;
  domain: AssertionDomain;
  evidenceKind: string;
  evidenceId: string;
  evidenceExcerpt?: string | null;
  sensitivity?: AssertionSensitivity;
  occurredAt?: string | null;
};

export type ReportedClaimPair = {
  sourceStatement: KnowledgeAssertionInput;
  underlyingClaim: KnowledgeAssertionInput;
  sourceEvidence: Omit<AssertionEvidenceLinkInput, 'assertionId'>;
};

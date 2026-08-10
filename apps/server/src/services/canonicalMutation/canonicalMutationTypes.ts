export const CANONICAL_MUTATION_CONTRACT_VERSION = 'canonical-mutation-v1' as const;

export type MutationIntent =
  | 'CORRECT'
  | 'UPDATE'
  | 'SUPERSEDE'
  | 'MERGE'
  | 'SPLIT'
  | 'RETIRE'
  | 'RESTORE'
  | 'INVALIDATE'
  | 'CONFIRM'
  | 'REJECT';

export type MutationCategory =
  | 'IDENTITY'
  | 'NARRATIVE'
  | 'RELATIONSHIP'
  | 'PROJECT'
  | 'TIMELINE'
  | 'EVIDENCE'
  | 'ASSERTION'
  | 'PREFERENCE'
  | 'PROFILE'
  | 'CURRENT_FOCUS';

export type MutationAuthority =
  | 'USER_EXPLICIT'
  | 'USER_CONFIRMED'
  | 'SYSTEM_DERIVED'
  | 'IMPORTED_SOURCE'
  | 'MANUAL_OPERATOR';

export type MutationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type MutationReason =
  | 'EXPLICIT_USER_CORRECTION'
  | 'EXPLICIT_USER_UPDATE'
  | 'DERIVED_INFERENCE'
  | 'TEMPORAL_RECONCILIATION'
  | 'DUPLICATE_RESOLUTION'
  | 'POLICY_ENFORCEMENT'
  | 'REVIEW_APPROVAL'
  | 'MRQ_RESOLUTION'
  | 'SYSTEM_MAINTENANCE';

export type MutationApprovalPolicy =
  | 'AUTOMATIC'
  | 'REVIEW'
  | 'CONFIRMATION'
  | 'MANUAL_ONLY'
  | 'FORBIDDEN';

export type MutationGovernanceOutcome =
  | 'ALLOW_AUTOMATIC'
  | 'QUEUE_REVIEW'
  | 'REQUIRE_CONFIRMATION'
  | 'REQUIRE_MANUAL_ACTION'
  | 'REJECT_BY_POLICY'
  | 'NO_CHANGE';

export type CanonicalMutationEvidence = {
  sourceType: 'chat_message' | 'conversation_message' | 'journal_entry' | 'document' | 'import' | 'manual';
  sourceId: string;
  relation: 'SUPPORTS' | 'CORRECTS' | 'CONTRADICTS' | 'CONTEXTUALIZES';
};

export type CanonicalMutationEnvelope = {
  version: typeof CANONICAL_MUTATION_CONTRACT_VERSION;
  userId: string;
  actorId: string;
  requestorProjection: string;
  target: {
    artifactType: string;
    artifactId: string;
    field: string;
    ownerProjection: string;
  };
  intent: MutationIntent;
  category: MutationCategory;
  previousValue: unknown;
  proposedValue: unknown;
  authority: MutationAuthority;
  evidence: CanonicalMutationEvidence[];
  risk: MutationRisk;
  reason: MutationReason;
  requestedPolicy?: MutationApprovalPolicy;
  affectedProjections: string[];
  rationale: string;
};

export type CanonicalMutationDecision = {
  mutationKey: string;
  contractVersion: typeof CANONICAL_MUTATION_CONTRACT_VERSION;
  outcome: MutationGovernanceOutcome;
  policy: MutationApprovalPolicy;
  reason: string;
  permitted: boolean;
  requiresAtomicAdapter: boolean;
  envelope: CanonicalMutationEnvelope;
};

export type CanonicalMutationApplyResult = CanonicalMutationDecision & {
  applied: boolean;
  executionOutcome: 'NOT_EXECUTED' | 'APPLIED' | 'FAILED_TRANSACTION';
  transactionMode: 'ATOMIC' | 'NOT_APPLICABLE';
  mutationId?: string;
  projectionInvalidationEvent?: {
    type: 'PROJECTION_INVALIDATION_REQUESTED';
    mutationId: string;
    projections: string[];
  };
  error?: string;
};

export type AtomicCanonicalMutationAdapter = {
  atomic: true;
  apply(decision: CanonicalMutationDecision): Promise<{ mutationId: string }>;
};

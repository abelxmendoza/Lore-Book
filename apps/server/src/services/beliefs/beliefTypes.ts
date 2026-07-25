/** Belief Cognition Engine v2 — shared types. */

export type SpeechAct =
  | 'AUTOBIOGRAPHICAL_ASSERTION'
  | 'WORLD_ASSERTION'
  | 'RELATIONSHIP_ASSERTION'
  | 'CORRECTION'
  | 'RETRACTION'
  | 'QUESTION'
  | 'COMMAND'
  | 'REQUEST'
  | 'UI_FEEDBACK'
  | 'SYSTEM_FEEDBACK'
  | 'PRODUCT_FEEDBACK'
  | 'HYPOTHETICAL'
  | 'QUOTE'
  | 'ROLEPLAY'
  | 'JOKE'
  | 'CONVERSATIONAL_FILLER'
  | 'UNKNOWN';

export type PropositionDomain =
  | 'IDENTITY'
  | 'OCCUPATION'
  | 'RESIDENCE'
  | 'RELATIONSHIP'
  | 'EDUCATION'
  | 'EMPLOYMENT'
  | 'PREFERENCE'
  | 'BELIEF_OR_OPINION'
  | 'EMOTIONAL_STATE'
  | 'PHYSICAL_STATE'
  | 'PLAN'
  | 'EVENT'
  | 'WORLD_FACT'
  | 'ENTITY_CLASSIFICATION'
  | 'PROJECT_FACT'
  | 'PROJECT_GOAL'
  | 'PRODUCT_REQUIREMENT'
  | 'UI_PREFERENCE'
  | 'ASSISTANT_FEEDBACK'
  | 'ALLEGATION'
  | 'CORRECTION'
  | 'UNKNOWN';

export type PropositionDurability =
  | 'DURABLE'
  | 'SEMI_DURABLE'
  | 'TEMPORARY_STATE'
  | 'EVENT_ONLY'
  | 'PLAN_ONLY'
  | 'SESSION_ONLY'
  | 'NOT_MEMORY_WORTHY'
  | 'UNKNOWN';

export type BeliefRoutingTarget =
  | 'TRUTH_STATE'
  | 'EVENT'
  | 'MOMENT'
  | 'TEMPORAL_STATE'
  | 'PLAN'
  | 'PROJECT_REQUIREMENT'
  | 'PROJECT_GOAL'
  | 'UI_PREFERENCE'
  | 'ASSISTANT_FEEDBACK'
  | 'RELATIONSHIP_GRAPH'
  | 'ENTITY_REGISTRY'
  | 'CORRECTION_QUEUE'
  | 'REJECT';

export type BeliefDecision =
  | 'ACCEPT'
  | 'REVIEW'
  | 'REJECT'
  | 'ROUTE'
  | 'ADD_EVIDENCE'
  | 'SUPERSEDE'
  | 'ADD_NEGATIVE_CONSTRAINT';

export type ConfirmationRequirement =
  | 'AUTO_APPLY'
  | 'PASSIVE_CONFIRMATION'
  | 'EXPLICIT_CONFIRMATION'
  | 'BLOCK_UNTIL_CONFIRMED'
  | 'REJECT';

export type TruthMutation =
  | 'ADD'
  | 'ADD_EVIDENCE'
  | 'UPDATE'
  | 'SUPERSEDE'
  | 'RETRACT'
  | 'TEMPORALLY_CLOSE'
  | 'MERGE'
  | 'ROUTE_TO_EVENT'
  | 'ROUTE_TO_STATE'
  | 'ROUTE_TO_PLAN'
  | 'ROUTE_TO_PROJECT'
  | 'ADD_NEGATIVE_CONSTRAINT'
  | 'REJECT'
  | 'REQUIRE_CONFIRMATION';

export type BeliefPolarity = 'POSITIVE' | 'NEGATIVE';

export type BeliefModality =
  | 'ASSERTED'
  | 'REPORTED'
  | 'BELIEVED'
  | 'PLANNED'
  | 'DESIRED'
  | 'HYPOTHETICAL'
  | 'ALLEGED'
  | 'DISPUTED'
  | 'UNCERTAIN';

export type BeliefSensitivity =
  | 'NORMAL'
  | 'PRIVATE'
  | 'HIGHLY_PRIVATE'
  | 'REPUTATIONAL'
  | 'SEXUAL'
  | 'LEGAL'
  | 'HEALTH'
  | 'FINANCIAL'
  | 'IDENTITY_CRITICAL';

export type BeliefDuplicateDecision =
  | 'EXACT_DUPLICATE'
  | 'SEMANTIC_DUPLICATE'
  | 'ENTAILS_EXISTING'
  | 'EXTENDS_EXISTING'
  | 'TEMPORALLY_DISTINCT'
  | 'ATTRIBUTION_DISTINCT'
  | 'NOT_DUPLICATE';

export type BeliefMigrationDecision =
  | 'KEEP_AS_DURABLE_BELIEF'
  | 'RECOMPILE'
  | 'MERGE_DUPLICATE'
  | 'ROUTE_TO_EVENT'
  | 'ROUTE_TO_TEMPORAL_STATE'
  | 'ROUTE_TO_PLAN'
  | 'ROUTE_TO_PROJECT_GOAL'
  | 'ROUTE_TO_PRODUCT_REQUIREMENT'
  | 'ROUTE_TO_UI_PREFERENCE'
  | 'ROUTE_TO_ASSISTANT_FEEDBACK'
  | 'REPAIR_SUBJECT'
  | 'REPAIR_ATTRIBUTION'
  | 'RESOLVE_CORRECTION_TARGET'
  | 'ADD_NEGATIVE_CONSTRAINT'
  | 'ARCHIVE_INVALID'
  | 'NEEDS_REVIEW';

export interface TemporalScope {
  validAt?: string;
  validFrom?: string;
  validUntil?: string;
  occurredAt?: string;
  referenceExpression?: string;
  resolutionConfidence: number;
  timezone?: string;
}

export interface PropositionAttribution {
  assertionSource:
    | 'USER_DIRECT'
    | 'OTHER_PERSON'
    | 'GROUP'
    | 'DOCUMENT'
    | 'SOCIAL_MEDIA'
    | 'ASSISTANT_INFERENCE'
    | 'UNKNOWN';
  claimantEntityIds: string[];
  targetEntityIds: string[];
  status:
    | 'DIRECT_ASSERTION'
    | 'REPORTED_CLAIM'
    | 'ALLEGATION'
    | 'DISPUTED'
    | 'CONFIRMED'
    | 'DENIED'
    | 'UNCERTAIN';
  attributionText?: string;
}

export interface BeliefConfidenceBreakdown {
  extractionConfidence: number;
  speechActConfidence: number;
  subjectResolutionConfidence: number;
  predicateConfidence: number;
  objectResolutionConfidence: number;
  autobiographicalRelevance: number;
  durabilityConfidence: number;
  temporalResolutionConfidence: number;
  attributionConfidence: number;
  duplicateResolutionConfidence: number;
  sourceTrust: number;
  overallEligibilityConfidence: number;
}

export interface CompiledProposition {
  propositionId: string;
  subject: {
    entityId?: string;
    displayName: string;
    entityType:
      | 'USER'
      | 'PERSON'
      | 'ORGANIZATION'
      | 'PLACE'
      | 'PROJECT'
      | 'EVENT'
      | 'OBJECT'
      | 'UNKNOWN';
    confidence: number;
  };
  predicate: string;
  object?: {
    entityId?: string;
    displayName?: string;
    literalValue?: string | number | boolean;
    entityType?: string;
    confidence: number;
  };
  polarity: BeliefPolarity;
  modality: BeliefModality;
  domain: PropositionDomain;
  durability: PropositionDurability;
  temporalScope?: TemporalScope;
  attribution?: PropositionAttribution;
  evidenceIds: string[];
  confidenceBreakdown: BeliefConfidenceBreakdown;
  renderedText: string;
  sourceQuote: string;
}

export interface BeliefSubjectResolution {
  subjectEntityId?: string;
  displayName: string;
  entityType: CompiledProposition['subject']['entityType'];
  sourceSpan: string;
  method:
    | 'EXPLICIT_NAME'
    | 'FIRST_PERSON'
    | 'PRONOUN_RESOLUTION'
    | 'GRAMMATICAL_SUBJECT'
    | 'CONVERSATION_TOPIC'
    | 'ATTRIBUTED_SPEAKER'
    | 'UNRESOLVED';
  confidence: number;
  rejectedCandidates: Array<{
    entityId?: string;
    label: string;
    reason: string;
  }>;
}

export interface PropositionFingerprint {
  normalizedSubjectId?: string;
  normalizedPredicate: string;
  normalizedObjectId?: string;
  normalizedLiteral?: string;
  polarity: string;
  modality: string;
  temporalBucket?: string;
  attributionFingerprint?: string;
  evidenceId?: string;
}

export interface CorrectionTargetResolution {
  candidateBeliefIds: string[];
  selectedBeliefId?: string;
  matchMethod:
    | 'EXACT_PROPOSITION'
    | 'SEMANTIC_MATCH'
    | 'NEGATION_MATCH'
    | 'ENTITY_RELATION_MATCH'
    | 'CONVERSATION_CONTEXT'
    | 'UNRESOLVED';
  confidence: number;
}

export interface TruthMutationPlan {
  mutation: TruthMutation;
  targetBeliefIds: string[];
  compiledProposition?: CompiledProposition;
  reason: string;
  confidence: number;
  evidenceIds: string[];
  rollbackPayload?: unknown;
}

export interface BeliefEligibilityResult {
  eligible: boolean;
  speechActAllowed: boolean;
  subjectResolved: boolean;
  durableEnough: boolean;
  semanticallyComplete: boolean;
  notNoise: boolean;
  reasons: string[];
}

export interface BeliefCognitionInput {
  userId: string;
  userDisplayName?: string;
  claimText: string;
  sourceText: string;
  entityId?: string;
  entityName?: string;
  /** Organizational metadata only — never used as proposition subject by default. */
  storyGroupLabel?: string;
  evidenceIds?: string[];
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  extractionConfidence?: number;
  existingClaimIds?: string[];
  existingClaimTexts?: Array<{ id: string; text: string }>;
  now?: Date;
  metadata?: Record<string, unknown>;
}

export interface BeliefDiagnosticTrace {
  sourceText: string;
  claimText: string;
  speechAct: SpeechAct;
  subject: BeliefSubjectResolution;
  rejectedSubjectCandidates: BeliefSubjectResolution['rejectedCandidates'];
  domain: PropositionDomain;
  durability: PropositionDurability;
  modality: BeliefModality;
  routingTarget: BeliefRoutingTarget;
  duplicateDecision: BeliefDuplicateDecision;
  correctionTarget: CorrectionTargetResolution;
  eligibility: BeliefEligibilityResult;
  confirmationRequirement: ConfirmationRequirement;
  finalDecision: BeliefDecision;
  reasons: string[];
  warnings: string[];
}

export interface BeliefCognitionResult {
  speechAct: SpeechAct;
  proposition: CompiledProposition;
  eligibility: BeliefEligibilityResult;
  routingTarget: BeliefRoutingTarget;
  decision: BeliefDecision;
  mutationPlan: TruthMutationPlan;
  confirmationRequirement: ConfirmationRequirement;
  duplicateDecision: BeliefDuplicateDecision;
  correctionTarget: CorrectionTargetResolution;
  sensitivity: BeliefSensitivity[];
  fingerprint: PropositionFingerprint;
  diagnostic: BeliefDiagnosticTrace;
  /** Legacy MRQ kind hint for metadata.proposal_kind */
  proposalKindHint:
    | 'durable_fact'
    | 'identity_fact'
    | 'occupation'
    | 'relationship'
    | 'event'
    | 'plan'
    | 'preference'
    | 'emotional_state'
    | 'entity_classification'
    | 'correction'
    | 'retraction';
}

export interface BeliefQueueAuditRecord {
  proposalId: string;
  originalText: string;
  speechAct: SpeechAct;
  compiledProposition?: CompiledProposition;
  originalKind: string;
  proposedDomain?: PropositionDomain;
  proposedDurability?: PropositionDurability;
  routingTarget: BeliefRoutingTarget;
  migrationDecision: BeliefMigrationDecision;
  existingMatchIds: string[];
  duplicateIds: string[];
  contradictionIds: string[];
  correctionTargetIds: string[];
  removedStoryGroupSubject?: string;
  repairedSubject?: string;
  sensitivity: BeliefSensitivity[];
  warnings: string[];
  proposedMutation?: TruthMutationPlan;
  confidence: number;
}

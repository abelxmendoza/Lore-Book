/** LoreBook Response Compiler — types for provenance-aware assistant artifacts. */

export type AssistantClaimType =
  | 'identity_claim'
  | 'relationship_claim'
  | 'location_claim'
  | 'school_claim'
  | 'work_claim'
  | 'group_claim'
  | 'event_claim'
  | 'timeline_claim'
  | 'emotional_claim'
  | 'inference_claim'
  | 'recommendation_claim'
  | 'action_claim';

export type GroundingStatus = 'grounded' | 'inferred' | 'unsupported' | 'contradicted';

export type StatementKind = 'FACT' | 'INFERENCE' | 'SPECULATION' | 'QUESTION' | 'SUGGESTION';

export type CertaintyLevel = 'certain' | 'likely' | 'uncertain';

export type AssistantClaim = {
  id: string;
  type: AssistantClaimType;
  claim: string;
  sourceSentence: string;
  statementKind: StatementKind;
  certainty: CertaintyLevel;
};

export type ClaimProvenance = {
  sourceMessageIds: string[];
  sourceQuotes: string[];
  sourceEntities: string[];
  parserFrames: string[];
  confidence: number;
};

export type GroundedClaim = AssistantClaim & {
  grounding: GroundingStatus;
  provenance?: ClaimProvenance;
};

export type ResponseContradiction = {
  claimId: string;
  claim: string;
  severity: 'low' | 'medium' | 'high';
  type: string;
  canonFact: string;
  reason: string;
};

export type ResponseActionCandidate = {
  type: string;
  label: string;
  confidence: number;
  requiresConfirmation: true;
  payload?: Record<string, unknown>;
};

export type BlockedMemoryCandidate = {
  claim: string;
  reason: string;
  category: string;
};

export type CompilerRuleFired =
  | 'grounding'
  | 'provenance'
  | 'contradiction'
  | 'uncertainty'
  | 'inference_classifier'
  | 'memory_write_filter'
  | 'action_extraction';

export type SourceMessageWitness = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
};

export type CanonFact = {
  domain: string;
  fact: string;
  entityName?: string;
  sourceMessageId?: string;
};

export type ParserFrameRef = {
  frameId: string;
  label: string;
  entities?: string[];
};

export type ResponseCompileInput = {
  userId: string;
  rawResponse: string;
  /** User-originated witness messages — authoritative evidence only. */
  sourceMessages: SourceMessageWitness[];
  parserFrames?: ParserFrameRef[];
  canonFacts?: CanonFact[];
  memoryReviewItems?: Array<{ claim: string; category: string }>;
  meaningFrameSummary?: string[];
};

export type CompiledAssistantResponse = {
  rawResponse: string;
  groundedClaims: GroundedClaim[];
  inferredClaims: GroundedClaim[];
  unsupportedClaims: GroundedClaim[];
  contradictions: ResponseContradiction[];
  actionCandidates: ResponseActionCandidate[];
  provenanceBindings: Array<{ claimId: string; provenance: ClaimProvenance }>;
  certaintyScore: number;
  memoryCandidatesBlocked: BlockedMemoryCandidate[];
  rulesFired: CompilerRuleFired[];
  /** Verified text safe to show — hedges unsupported claims when needed. */
  verifiedResponse: string;
};

export type ResponseInspectorReport = {
  rawResponse: string;
  verifiedResponse: string;
  claims: Array<{
    claim: string;
    grounding: GroundingStatus;
    statementKind: StatementKind;
    certainty: CertaintyLevel;
    icon: '✓' | '~' | '?' | '⚠';
    provenance?: ClaimProvenance;
  }>;
  contradictions: ResponseContradiction[];
  actionCandidates: ResponseActionCandidate[];
  rulesFired: CompilerRuleFired[];
  certaintyScore: number;
  memoryCandidatesBlocked: BlockedMemoryCandidate[];
};

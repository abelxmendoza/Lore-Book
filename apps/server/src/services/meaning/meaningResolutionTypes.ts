/**
 * Meaning Resolution — interpretation layer between Lexer and Planner.
 * Lexer answers "what signals were found?" Meaning answers "what do they mean?"
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';

export type Factuality =
  | 'fact'
  | 'opinion'
  | 'hypothetical'
  | 'desire'
  | 'uncertain'
  | 'question';

export type TemporalStatus = 'past' | 'present' | 'future' | 'desired' | 'former';

export type RelationshipRole =
  | 'mother'
  | 'father'
  | 'estranged_father'
  | 'estranged_mother'
  | 'sibling'
  | 'cousin'
  | 'friend'
  | 'close_friend'
  | 'ally'
  | 'romantic_partner'
  | 'ex_partner'
  | 'coworker'
  | 'boss'
  | 'mentor'
  | 'student'
  | 'rival'
  | 'acquaintance'
  | 'community_member'
  | 'promoter'
  | 'vendor'
  | 'teammate'
  | 'coach';

export interface ResolvedBase {
  confidence: number;
  resolutionReason: string;
  requiresConfirmation: boolean;
}

export interface ResolvedEntity extends ResolvedBase {
  surface: string;
  normalized: string;
  kind: 'PERSON' | 'ORGANIZATION' | 'ROLE' | 'PROJECT';
  entityId?: string;
  isSelf?: boolean;
  isUnresolved?: boolean;
  temporalStatus?: TemporalStatus;
}

export interface ResolvedRelationship extends ResolvedBase {
  role: RelationshipRole;
  targetName?: string;
  targetEntityId?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'estranged';
  cue: string;
}

export interface ResolvedSkill extends ResolvedBase {
  name: string;
  category: string;
  hobbyOrPaid: 'hobby' | 'paid' | 'both' | 'unknown';
  currentOrFormer: 'current' | 'former' | 'unknown';
  proficiencyHint: string;
  usageFrequencyHint: string;
  enjoymentHint: string;
  loreContext: string;
}

export interface ResolvedPlace extends ResolvedBase {
  name: string;
  category: string;
  cue: string;
}

export interface ResolvedEvent extends ResolvedBase {
  kind: string;
  subject?: string;
  cue: string;
  temporalStatus?: TemporalStatus;
}

export interface ResolvedReference {
  reference: string;
  antecedent: string;
  antecedentKind: string;
  relation?: string;
  confidence: number;
  resolutionReason: string;
}

export interface MeaningAmbiguity {
  code: string;
  description: string;
  candidates: string[];
  confidence: number;
}

export interface IdentityCollision {
  name: string;
  claims: Array<'self' | 'relationship'>;
  relationshipRole?: string;
  characterId?: string;
  confidence: number;
  mustNotAutoMerge: true;
  requiresConfirmation: true;
}

export interface PotentialContradiction {
  field: string;
  existingFact: string;
  newClaim: string;
  severity: 'low' | 'medium' | 'high';
  needsReview: true;
}

export interface TemporalContext {
  defaultStatus: TemporalStatus;
  statements: Array<{
    subject: string;
    predicate: string;
    object: string;
    status: TemporalStatus;
    cue: string;
  }>;
}

export type OntologyActionKind =
  | 'set_legal_name'
  | 'distinct_from_self'
  | 'merge_into_self'
  | 'add_skill'
  | 'set_relationship'
  | 'resolve_duplicate'
  | 'navigate_surface'
  | 'confirm_contradiction';

export interface OntologyActionCandidate {
  kind: OntologyActionKind;
  label: string;
  confidence: number;
  requiresConfirmation: true;
  payload: Record<string, unknown>;
}

export interface MemoryReviewCandidate {
  claim: string;
  category: 'skill' | 'relationship' | 'preference' | 'identity' | 'event' | 'place' | 'goal' | 'general';
  confidence: number;
  requiresConfirmation: boolean;
  source: string;
}

export interface MeaningResolutionInput {
  userId: string;
  messageId: string;
  threadId?: string;
  text: string;
  lexicalResult: LexicalAnalysisResult;
  timestamp: string;
  priorMentionedNames?: string[];
  lexicalResultId?: string;
}

export interface MeaningResolutionResult {
  userId: string;
  messageId: string;
  threadId?: string;
  rawText: string;

  resolvedEntities: ResolvedEntity[];
  resolvedRelationships: ResolvedRelationship[];
  resolvedSkills: ResolvedSkill[];
  resolvedPlaces: ResolvedPlace[];
  resolvedEvents: ResolvedEvent[];

  references: ResolvedReference[];
  identityCollisions: IdentityCollision[];
  contradictions: PotentialContradiction[];
  ambiguities: MeaningAmbiguity[];

  temporalContext: TemporalContext;
  factuality: Factuality;
  confidence: number;

  ontologyActionCandidates: OntologyActionCandidate[];
  memoryReviewCandidates: MemoryReviewCandidate[];

  createdAt: string;
}

/** @deprecated Use OntologyActionCandidate */
export type ResolutionAction = OntologyActionCandidate;
export type ResolutionActionKind = OntologyActionKind;

/** Hard-fact memory threshold */
export const MEANING_HARD_FACT_CONFIDENCE = 0.85;

/**
 * LoreBook Semantic Analyzer — unified Stage 2 output contract.
 *
 * This is the single typed artifact every downstream system consumes
 * (suggestions, chat recall, MRQ, redirects, composer preview, admin explorer).
 *
 * Design rules:
 *  - The analyzer NEVER writes to storage. It emits meaning + gated candidates.
 *  - Every commit-capable item carries a `gate` so a single write gate (MRQ)
 *    can route on one field.
 *  - Layers not yet populated (stance / temporal / contradiction) are typed but
 *    returned empty — the shape is stable so future layers fill it without a
 *    breaking change. They are NOT faked.
 */

import type {
  EntityRef,
  EvidenceBundle,
  LoreBookDomain,
  LoreBookOperation,
  LoreBookParseResult,
  OperationGate,
} from '../parser/loreBookParserTypes';

/** How a mention resolved against the user's canon. */
export type SemanticResolution = 'known' | 'similar' | 'new' | 'ambiguous';

/** A grounded entity mention. */
export interface SemanticEntity {
  name: string;
  domain: LoreBookDomain;
  resolution: SemanticResolution;
  /** Set when resolution is `known` or `similar`. */
  matchedId?: string;
  matchedName?: string;
  confidence: number;
  /** Human-readable reasons this resolution was chosen. */
  criteria: string[];
  evidence?: EvidenceBundle;
  sourceSpanIds: string[];
  gate: OperationGate;
}

/** A typed relationship between two entities. */
export interface SemanticEdge {
  from: EntityRef;
  to: EntityRef;
  relationType: string;
  confidence: number;
  evidence?: EvidenceBundle;
  gate: OperationGate;
  /** False → relationship is dangling and must be confirmed before commit. */
  bothEndpointsResolved: boolean;
}

/** An event / timeline mention. */
export interface SemanticEvent {
  name: string;
  domain: LoreBookDomain;
  confidence: number;
  evidence?: EvidenceBundle;
  gate: OperationGate;
}

/** "This looks like it belongs in a different book." */
export interface CrossBookHint {
  name: string;
  fromDomain: LoreBookDomain;
  toDomain: LoreBookDomain;
  reason: string;
  confidence: number;
}

/** A mention the analyzer cannot resolve alone — the user must disambiguate. */
export interface SemanticAmbiguity {
  name: string;
  domain: LoreBookDomain;
  question: string;
  candidates: Array<{
    domain: LoreBookDomain;
    matchedId?: string;
    matchedName?: string;
    confidence: number;
  }>;
}

/** A commit-capable candidate, gated for the MRQ write gate. */
export interface SemanticReviewItem {
  operation: LoreBookOperation;
  reason: string;
  gate: OperationGate;
}

/** One explainability step. */
export interface ProvenanceStep {
  /** 'lexical' | 'parser' | 'cross_book_guard' | 'identity' | ... */
  stage: string;
  rule: string;
  detail?: string;
}

/* ------------------------------------------------------------------ *
 * Layers declared but not yet populated by the analyzer (Phase >1.5).
 * Typed here so the contract is stable; arrays come back empty today.
 * ------------------------------------------------------------------ */

export type StancePolarity = 'likes' | 'dislikes' | 'believes' | 'did' | 'feels';

export interface StanceSignal {
  subject: string; // usually 'SELF'
  polarity: StancePolarity;
  target: string;
  confidence: number;
  evidence?: EvidenceBundle;
}

export interface TemporalFrame {
  sourcePhrase: string;
  anchor?: string; // ISO when resolvable
  rangeStart?: string;
  rangeEnd?: string;
  certainty: number;
}

export interface ContradictionHint {
  claim: string;
  priorBelief?: string;
  verdict: 'supports' | 'contradicts' | 'unknown';
  confidence: number;
}

/** The unified semantic analysis result. */
export interface SemanticAnalysis {
  userId: string;
  text: string;
  messageId?: string;
  threadId?: string;

  entities: SemanticEntity[];
  relationships: SemanticEdge[];
  events: SemanticEvent[];
  crossBook: CrossBookHint[];
  ambiguities: SemanticAmbiguity[];
  reviewItems: SemanticReviewItem[];
  suppressed: Array<{ name: string; reason: string }>;

  // Declared-but-empty layers (see note above).
  stances: StanceSignal[];
  temporal: TemporalFrame[];
  contradictions: ContradictionHint[];

  provenance: ProvenanceStep[];
  confidence: number;
  warnings: string[];

  /** Raw parser output, for debugging / admin explorer. Omitted unless requested. */
  raw?: LoreBookParseResult;
}

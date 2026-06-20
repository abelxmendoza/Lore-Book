/**
 * LoreBook Parse Engine — types.
 * Lexical Intelligence detects spans; this layer emits book-aware operations.
 */

import type { LexicalIntelligenceSpan } from '../../lexical/intelligence/lexicalIntelligenceTypes';

export type LoreBookDomain =
  | 'characters'
  | 'locations'
  | 'skills'
  | 'projects'
  | 'quests'
  | 'organizations'
  | 'groups'
  | 'relationships'
  | 'timeline'
  | 'events'
  | 'family'
  | 'schools'
  | 'work';

export type OperationGate = 'auto' | 'suggest' | 'review' | 'block';

export type EvidenceBundle = {
  quote: string;
  messageId?: string;
  threadId?: string;
  start?: number;
  end?: number;
  lexicalRulesFired?: string[];
  parserRulesFired?: string[];
};

export type EntityRef = {
  entityId?: string;
  domain: LoreBookDomain;
  name: string;
  canonicalKey?: string;
};

export type LoreBookOperation =
  | {
      kind: 'suggest_add';
      domain: LoreBookDomain;
      name: string;
      evidence: EvidenceBundle;
      confidence: number;
      sourceSpans: string[];
      gate: OperationGate;
    }
  | {
      kind: 'suggest_merge';
      domain: LoreBookDomain;
      name: string;
      targetBookId: string;
      targetName: string;
      reason: string;
      confidence: number;
      gate: 'review';
    }
  | {
      kind: 'redirect';
      fromDomain: LoreBookDomain;
      toDomain: LoreBookDomain;
      name: string;
      reason: string;
      confidence: number;
    }
  | {
      kind: 'link';
      fromEntity: EntityRef;
      toEntity: EntityRef;
      relationType: string;
      evidence: EvidenceBundle;
      confidence: number;
      gate: 'suggest' | 'review';
    }
  | {
      kind: 'update_attribute';
      entityId: string;
      domain: LoreBookDomain;
      field: string;
      value: unknown;
      evidence: EvidenceBundle;
      confidence: number;
      gate: 'suggest' | 'review';
    }
  | {
      kind: 'attach_evidence';
      entityId: string;
      domain: LoreBookDomain;
      quote: string;
      messageId?: string;
      confidence: number;
    }
  | {
      kind: 'suppress';
      name: string;
      reason: string;
      sourceSpans: string[];
    };

export type CanonEntity = {
  id: string;
  domain: LoreBookDomain;
  displayName: string;
  canonicalKey: string;
  aliases: string[];
  entityType: string;
  confidence?: number;
  lastSeenAt?: string;
};

export type CanonAlias = {
  alias: string;
  canonicalKey: string;
  domain: LoreBookDomain;
  entityId: string;
};

export type CanonPendingSuggestion = {
  domain: LoreBookDomain;
  name: string;
  canonicalKey: string;
};

export type CanonCorrection = {
  originalValue: string;
  correctedValue: string;
  fromDomain?: LoreBookDomain;
  toDomain?: LoreBookDomain;
  kind?: string;
};

export type CanonIndex = {
  characters: CanonEntity[];
  locations: CanonEntity[];
  skills: CanonEntity[];
  projects: CanonEntity[];
  quests: CanonEntity[];
  organizations: CanonEntity[];
  groups: CanonEntity[];
  relationships: CanonEntity[];
  schools: CanonEntity[];
  work: CanonEntity[];
  aliases: CanonAlias[];
  pendingSuggestions: CanonPendingSuggestion[];
  correctionHistory: CanonCorrection[];
};

export type LoreBookParseDebug = {
  canonMatches: Array<{ name: string; domain: LoreBookDomain; entityId: string; matchType: string }>;
  rulesFired: string[];
  duplicateChecks: Array<{ name: string; status: string; matchedName?: string }>;
  crossBookGuards: Array<{ name: string; allowed: boolean; rejectedAs?: string; reason?: string }>;
  qualityGates?: Array<{
    name: string;
    domain: LoreBookDomain;
    gate: string;
    reason?: string;
    provenance?: string[];
  }>;
};

export type LoreBookParseResult = {
  userId: string;
  text: string;
  lexicalSpans: LexicalIntelligenceSpan[];
  operations: LoreBookOperation[];
  suppressed: LoreBookOperation[];
  redirects: LoreBookOperation[];
  warnings: string[];
  debug?: LoreBookParseDebug;
};

export type LoreBookParseOptions = {
  messageId?: string;
  threadId?: string;
  /** Pre-built canon — if omitted, empty canon is used (Phase 0 default). */
  canon?: CanonIndex;
  /** Include debug block on result. */
  includeDebug?: boolean;
  /** Skip lexical re-run when spans are supplied. */
  lexicalSpans?: LexicalIntelligenceSpan[];
};

export function isSuppressOperation(op: LoreBookOperation): op is Extract<LoreBookOperation, { kind: 'suppress' }> {
  return op.kind === 'suppress';
}

export function isRedirectOperation(op: LoreBookOperation): op is Extract<LoreBookOperation, { kind: 'redirect' }> {
  return op.kind === 'redirect';
}

/**
 * User-reviewed suggestion / identity decisions.
 *
 * Explicit user cleanup outranks lexical guess, LLM extraction, and rescan.
 */

import type { LoreBookDomain } from '../parser/loreBookParserTypes';

export type SuggestionDecisionType =
  | 'MERGED_INTO'
  | 'REJECTED_CANDIDATE'
  | 'NOT_SAME_ENTITY'
  | 'TYPE_CORRECTED'
  | 'ALIAS_CONFIRMED'
  | 'ARCHIVED';

export type SuggestionDecisionScope = 'entity' | 'book';

export type SuggestionDecision = {
  type: SuggestionDecisionType;
  domain: LoreBookDomain;
  normalizedKey: string;
  canonicalId?: string;
  canonicalName?: string;
  relatedId?: string;
  relatedNormalizedKey?: string;
  canonicalType?: string;
  scope: SuggestionDecisionScope;
  source: 'USER' | 'SYSTEM';
  createdAt: string;
  reason?: string;
  /** Weak identity rejections may be superseded by stronger naming evidence. */
  evidenceStrength: 'weak' | 'strong';
};

export type UserDecisionConsult = {
  type: SuggestionDecisionType;
  timestamp: string;
  source: SuggestionDecision['source'];
  reason?: string;
  superseded: boolean;
  suppressionReason?: string;
};

export function decisionBookKey(domain: string, normalizedKey: string): string {
  return `${domain}:${normalizedKey}`;
}

export function notSamePairKey(a: string, b: string): string {
  return [a, b].filter(Boolean).sort().join('|');
}

export const ORG_DECISION_DOMAINS: LoreBookDomain[] = ['organizations', 'groups', 'schools'];

export function decisionLookupDomains(domain: LoreBookDomain): LoreBookDomain[] {
  if (ORG_DECISION_DOMAINS.includes(domain)) return ORG_DECISION_DOMAINS;
  return [domain];
}

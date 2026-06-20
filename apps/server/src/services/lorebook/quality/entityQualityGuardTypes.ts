/**
 * Cross-domain entity quality gate — shared types.
 * Book modals represent entities; garbage spans must never become cards.
 */

import type { CrossBookIndex } from '../../lexical/projects/projectSuggestionTypes';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';

export type EntityQualityDomain = LoreBookDomain;

export type EntityQualityGate = 'allow' | 'contextualize' | 'review' | 'reject';

export type EntityQualityProvenance = {
  guard: string;
  rule: string;
  detail?: string;
};

export type EntityQualityCandidate = {
  name: string;
  domain: EntityQualityDomain;
  /** Full message or evidence line for context checks. */
  contextText?: string;
  evidence?: string;
  spanType?: string;
  confidence?: number;
  sourceMessageId?: string;
  sourceThreadId?: string;
};

export type EntityQualityContext = {
  userId?: string;
  crossBook?: CrossBookIndex;
  /** Known display names in the target book (for dedupe). */
  knownInBook?: Set<string>;
  knownInBookIds?: Map<string, string>;
};

export type EntityQualityVerdict = {
  gate: EntityQualityGate;
  /** Original candidate name. */
  name: string;
  /** When contextualize — enriched label safe to show as a card. */
  displayName?: string;
  domain: EntityQualityDomain;
  /** Suggested alternate domain when cross-book guard fires. */
  redirectDomain?: EntityQualityDomain;
  rejectionReason?: string;
  matchedCanonId?: string;
  matchedCanonName?: string;
  confidence: number;
  provenance: EntityQualityProvenance[];
  requiresReview: boolean;
};

export type CanonMatchHint = {
  id: string;
  name: string;
  matchType: 'exact' | 'alias' | 'similar';
};

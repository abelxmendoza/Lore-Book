/**
 * Attach-or-alias instead of spawning a second LoreBook card.
 *
 * Recognition of an existing identity enriches that identity.
 */

import type { LoreBookDomain } from '../parser/loreBookParserTypes';

export type AttachDecision =
  | 'ATTACH_EXACT'
  | 'ATTACH_ALIAS'
  | 'REVIEW_DUPLICATE'
  | 'CREATE_NEW'
  | 'REJECT'
  | 'DEGRADED';

export type AttachMatchBasis =
  | 'canonical_id'
  | 'exact_normalized'
  | 'existing_alias'
  | 'acronym_match'
  | 'normalized_skill_identity'
  | 'place_acronym'
  | 'first_name_only'
  | 'containment'
  | 'unique_org_stem_with_full_identity_evidence'
  | 'fuzzy_similarity'
  | 'hierarchy_not_duplicate'
  | 'type_conflict_weak_identity'
  | 'routed_canonical'
  | 'relational_reference'
  | 'malformed_span'
  | 'none';

export type AttachEvidenceRef = {
  quote: string;
  sourceMessageId?: string;
  start?: number;
  end?: number;
};

export type AttachCanonRecord = {
  id: string;
  name: string;
  aliases: string[];
  domain: LoreBookDomain;
  canonicalType?: string;
  userId?: string;
  mentionCount?: number;
  evidence?: AttachEvidenceRef[];
  status?: string;
  distinctFrom?: string[];
};

export type AttachCanonIndex = Partial<Record<LoreBookDomain, AttachCanonRecord[]>>;

export type CanonLoadStatus = 'ok' | 'degraded';

export type AttachEligibilityInput = {
  name: string;
  domain: LoreBookDomain;
  evidence?: string;
  incomingType?: string;
  sourceMessageId?: string;
  spanStart?: number;
  spanEnd?: number;
  userId?: string;
  canon: AttachCanonIndex;
  canonStatus?: CanonLoadStatus;
};

export type AttachDiagnostic = {
  candidate: string;
  domain: LoreBookDomain;
  decision: AttachDecision;
  canonical?: { id: string; name: string; domain: LoreBookDomain };
  matchBasis: AttachMatchBasis;
  typeConflict: boolean;
  canonicalTypePreserved: boolean;
  aliasAdded: boolean;
  aliasToAdd?: string;
  evidenceAttached: boolean;
  suggestionSuppressed: boolean;
  contextualRole?: string;
  incomingTypeNormalized?: string;
  reason: string;
};

export type AttachPlan = AttachDiagnostic & {
  target: AttachCanonRecord;
  evidenceRef: AttachEvidenceRef;
  nextAliases: string[];
  nextEvidence: AttachEvidenceRef[];
  nextMentionCount: number;
};

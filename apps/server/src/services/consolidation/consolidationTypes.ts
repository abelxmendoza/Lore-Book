import type { TruthState } from '../truthState/truthStateTypes';

export type ConsolidationKind =
  | 'entity'
  | 'relationship'
  | 'timeline'
  | 'anchor'
  | 'general';

/** Source evidence fragment — never deleted during consolidation. */
export type ConsolidationEvidenceFragment = {
  id: string;
  text: string;
  claimKey: string;
  entityIds: string[];
  entityNames: string[];
  anchorIds: string[];
  anchorTitles: string[];
  eraLabels: string[];
  relationshipLabels: string[];
  eventAt?: string;
  sourceMessageId?: string;
  sourceQuote: string;
  truthState: TruthState;
  confidence: number;
  sensitiveCategories: string[];
  supersededById?: string;
  correctedFromId?: string;
  kind: ConsolidationKind;
};

export type ConsolidatedSummary = {
  id: string;
  summaryText: string;
  kind: ConsolidationKind;
  subjectKey: string;
  confidence: number;
  mentionCount: number;
  sourceMessageIds: string[];
  sourceQuotes: string[];
  sourceFragmentIds: string[];
  reviewRequired: boolean;
  contradicted: boolean;
  timelineOrdered: boolean;
  createdAt: string;
};

export type ConsolidationContradiction = {
  id: string;
  subjectKey: string;
  fragmentIds: string[];
  conflictingTexts: string[];
  reason: string;
  requiresReview: true;
};

export type ConsolidationInput = {
  fragments: ConsolidationEvidenceFragment[];
  seenAt?: string;
};

export type ConsolidationResult = {
  summaries: ConsolidatedSummary[];
  contradictions: ConsolidationContradiction[];
  rejectedExcluded: number;
  supersededExcluded: number;
  fragmentsPreserved: number;
};

export function normalizeClaimKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function subjectKeyFromFragment(fragment: ConsolidationEvidenceFragment): string {
  if (fragment.entityNames[0]) return normalizeClaimKey(fragment.entityNames[0]);
  if (fragment.anchorTitles[0]) return normalizeClaimKey(fragment.anchorTitles[0]);
  return fragment.claimKey;
}

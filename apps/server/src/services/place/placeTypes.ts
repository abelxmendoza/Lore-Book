/**
 * Place Cognition Engine v2 — shared types.
 * A Place is a persistent, uniquely identifiable location — not a noun phrase.
 */

export type PlaceMentionContext =
  | 'VISITED'
  | 'WORKED_AT'
  | 'ATTENDED'
  | 'LIVED_AT'
  | 'MENTIONED'
  | 'REFERENCED'
  | 'GREW_UP_IN'
  | 'TRAVELED_TO'
  | 'PLANNED_TO_VISIT'
  | 'HYPOTHETICAL';

export type PlaceEntityKind =
  | 'PLACE'
  | 'EVENT'
  | 'EVENT_SERIES'
  | 'ORGANIZATION'
  | 'GENERIC_REFERENCE'
  | 'SYNTHETIC_NARRATION'
  | 'FRAGMENT'
  | 'NON_PLACE';

export type PlaceDecision =
  | 'ACCEPT'
  | 'REVIEW'
  | 'REJECT'
  | 'MERGE_EXISTING'
  | 'HOLD_GENERIC'
  | 'ROUTE_EVENT'
  | 'ROUTE_ORGANIZATION';

export type PlaceSourceType =
  | 'chat'
  | 'journal'
  | 'user_import'
  | 'assistant'
  | 'system'
  | 'generated'
  | 'metadata'
  | 'test';

export type PlaceEligibilityResult = {
  eligible: boolean;
  persistentLocation: boolean;
  spatialMeaning: boolean;
  clearBoundary: boolean;
  userAuthoredEvidence: boolean;
  notMerelyDescriptive: boolean;
  reasons: string[];
};

export type PlaceCanonicalResolution = {
  canonicalTitle: string;
  aliases: string[];
  subtype?: string;
  entityKind: PlaceEntityKind;
  rulesFired: string[];
};

export type PlaceVisitInference = {
  mentionCount: number;
  visitCount: number;
  attendanceCount: number;
  referenceCount: number;
  userVisited: boolean;
  context: PlaceMentionContext;
};

export type PlaceEvidence = {
  text: string;
  sourceType: PlaceSourceType;
  sourceMessageId?: string;
};

export type PlaceDiagnosticTrace = {
  originalSpan: string;
  canonicalTitle: string;
  entityKind: PlaceEntityKind;
  decision: PlaceDecision;
  subtype?: string;
  mentionContext: PlaceMentionContext;
  visitInference: PlaceVisitInference;
  eligibility: PlaceEligibilityResult;
  description?: string;
  reasonsAccepted: string[];
  reasonsRejected: string[];
  rulesFired: string[];
  confidence: number;
};

export type PlaceCognitionInput = {
  span: string;
  evidenceText?: string;
  sourceType?: PlaceSourceType;
  proposedType?: string;
  proposedConfidence?: number;
  knownPlaceNames?: string[];
  userConfirmed?: boolean;
};

export type PlaceCognitionResult = {
  decision: PlaceDecision;
  canonicalTitle: string;
  aliases: string[];
  subtype?: string;
  entityKind: PlaceEntityKind;
  mentionContext: PlaceMentionContext;
  visitInference: PlaceVisitInference;
  description?: string;
  confidence: number;
  status: 'known' | 'new' | 'needs_review' | 'rejected';
  matchExistingName?: string;
  rejectionReason?: string;
  diagnostics: PlaceDiagnosticTrace;
};

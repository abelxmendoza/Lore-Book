/**
 * Narrative Anchor Cognition v1 — shared types.
 * Communities answer "who belongs together?"
 * Narrative anchors answer "what part of the user's life story is this?"
 */

export type NarrativeClusterType =
  | 'COMMUNITY'
  | 'HOUSEHOLD'
  | 'FAMILY_GROUP'
  | 'ORGANIZATION'
  | 'SOCIAL_CIRCLE'
  | 'EVENT_CLUSTER'
  | 'NARRATIVE_ANCHOR'
  | 'EVENT_ONLY'
  | 'UNKNOWN';

export type NarrativeAnchorChapterType =
  | 'LIFE_PERIOD'
  | 'PROJECT_CHAPTER'
  | 'RELATIONSHIP_CHAPTER'
  | 'WORK_CHAPTER'
  | 'FAMILY_CHAPTER'
  | 'SOCIAL_CHAPTER'
  | 'IDENTITY_CHAPTER'
  | 'CONFLICT_CHAPTER'
  | 'TRANSITION_CHAPTER'
  | 'PLACE_BASED_CHAPTER';

export type NarrativeAnchorDecision =
  | 'PUBLISH_ANCHOR'
  | 'ROUTE_COMMUNITY'
  | 'ROUTE_HOUSEHOLD'
  | 'ROUTE_FAMILY_GROUP'
  | 'ROUTE_ORGANIZATION'
  | 'ROUTE_SOCIAL_CIRCLE'
  | 'KEEP_EVENT_ONLY'
  | 'SPLIT'
  | 'NEEDS_REVIEW'
  | 'REJECT';

export type HonorificInterpretation =
  | 'LITERAL_KINSHIP_TITLE'
  | 'NICKNAME'
  | 'SOCIAL_TITLE'
  | 'HONORIFIC'
  | 'UNKNOWN';

export type HonorificResolution = {
  surfaceForm: string;
  interpretation: HonorificInterpretation;
  cleanedName: string;
  kinshipRelation?: string;
  confidence: number;
  reasons: string[];
};

export type EntityBoundaryRepair = {
  original: string;
  personName?: string;
  placeName?: string;
  householdName?: string;
  residual?: string;
  repaired: boolean;
  reasons: string[];
};

export type UserCentralityScore = {
  directParticipation: number;
  firstPersonEvidenceRatio: number;
  decisionInvolvement: number;
  emotionalInvolvement: number;
  consequenceToUser: number;
  finalScore: number;
  reasons: string[];
};

export type NarrativeCoherenceScore = {
  sharedTheme: number;
  causalContinuity: number;
  temporalContinuity: number;
  recurringEntities: number;
  recurringPlaces: number;
  recurringConflictOrGoal: number;
  semanticConsistency: number;
  finalScore: number;
  reasons: string[];
};

export type TemporalCoherenceScore = {
  dateCoverage: number;
  eventSpacing: number;
  continuity: number;
  temporalConflictPenalty: number;
  unresolvedDatePenalty: number;
  finalScore: number;
  reasons: string[];
};

export type NarrativeImpactScore = {
  emotionalIntensity: number;
  explicitImportance: number;
  lifeDirectionChange: number;
  identityChange: number;
  relationshipChange: number;
  workOrProjectImpact: number;
  conflictSeverity: number;
  resolutionStrength: number;
  finalScore: number;
  reasons: string[];
};

export type AnchorTitleQuality = {
  specificity: number;
  distinctiveness: number;
  narrativeMeaning: number;
  userCentrality: number;
  placeholderPenalty: number;
  entityLeakagePenalty: number;
  finalScore: number;
  reasons: string[];
};

export type NarrativeAnchorEligibility = {
  eventCount: number;
  distinctTimepoints: number;
  distinctPeopleCount: number;
  userCentrality: number;
  narrativeCoherence: number;
  temporalCoherence: number;
  emotionalGravity: number;
  identityImpact: number;
  recurrenceStrength: number;
  explicitUserImportance: number;
  eligible: boolean;
  reasons: string[];
  blockers: string[];
};

export type NarrativeAnchorCognitionInput = {
  title: string;
  proposedType?: string;
  peopleNames?: string[];
  groupNames?: string[];
  eventTitles?: string[];
  placeNames?: string[];
  evidenceLabels?: string[];
  signals?: string[];
  /** Membership-only evidence (N members share X) */
  membershipOnly?: boolean;
  memberCount?: number;
  eventCount?: number;
  significanceScore?: number;
  dates?: string[];
  evidenceText?: string;
  userNames?: string[];
  userConfirmed?: boolean;
};

export type NarrativeAnchorCognitionResult = {
  decision: NarrativeAnchorDecision;
  clusterType: NarrativeClusterType;
  chapterType?: NarrativeAnchorChapterType;
  title: string;
  theme?: string;
  status: 'published' | 'routed' | 'event_only' | 'rejected' | 'needs_review';
  confidence: number;
  eligibility: NarrativeAnchorEligibility;
  userCentrality: UserCentralityScore;
  narrativeCoherence: NarrativeCoherenceScore;
  temporalCoherence: TemporalCoherenceScore;
  impact: NarrativeImpactScore;
  titleQuality: AnchorTitleQuality;
  peopleNames: string[];
  placeNames: string[];
  boundaryRepairs: EntityBoundaryRepair[];
  honorifics: HonorificResolution[];
  rulesFired: string[];
  reasonsAccepted: string[];
  reasonsRejected: string[];
  rejectionReason?: string;
  routeTarget?: NarrativeClusterType;
};

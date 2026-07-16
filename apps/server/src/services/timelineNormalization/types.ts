/**
 * Timeline ontology — evidence → canonical events → arcs → chapters → eras.
 * Derived artifacts are rebuildable; raw conversation/journal evidence is immutable.
 */

export const TIMELINE_PIPELINE_VERSION = 'timeline-norm-v1';

export type TimelineRecordType =
  | 'memory_evidence'
  | 'canonical_event'
  | 'arc'
  | 'chapter'
  | 'era';

export type SourceSpeechAct =
  | 'life_event'
  | 'ongoing_state'
  | 'goal_or_plan'
  | 'reflection'
  | 'question'
  | 'command'
  | 'product_test'
  | 'conversation_management'
  | 'error_message'
  | 'assistant_text'
  | 'project_work';

export type LifeDomain =
  | 'career'
  | 'education'
  | 'relationships'
  | 'family'
  | 'health'
  | 'creative'
  | 'projects'
  | 'social'
  | 'finance'
  | 'inner_life'
  | 'location'
  | 'other';

export type TemporalPrecision =
  | 'exact_datetime'
  | 'exact_date'
  | 'date_range'
  | 'month'
  | 'season'
  | 'year'
  | 'approximate'
  | 'unknown';

export type FieldAuthority =
  | 'source_explicit'
  | 'user_corrected'
  | 'system_inferred'
  | 'model_generated';

export type EventTime = {
  start?: string;
  end?: string;
  precision: TemporalPrecision;
  isOngoing: boolean;
  source: 'explicit' | 'resolved_relative' | 'inferred' | 'message_timestamp';
  confidence: number;
};

export type EventEligibility = {
  describesOccurrence: boolean;
  autobiographical: boolean;
  temporallyGrounded: boolean;
  grammaticallyComplete: boolean;
  notConversationCommand: boolean;
  notDuplicate: boolean;
  confidence: number;
  rejectionReasons: string[];
};

export type SignificanceSignals = {
  lifeChangeMagnitude: number;
  emotionalImpact: number;
  duration: number;
  recurrence: number;
  userEmphasis: number;
  relationshipImportance: number;
  goalRelevance: number;
  causalImpact: number;
  evidenceStrength: number;
  novelty: number;
};

export type SignificanceScore = {
  total: number;
  signals: SignificanceSignals;
  explanation: string;
};

export type DomainScores = Partial<Record<LifeDomain, number>>;

export type DomainAssignment = {
  primary: LifeDomain;
  secondary: LifeDomain[];
  scores: DomainScores;
};

export type CanonicalEventCandidate = {
  id: string;
  title: string;
  description: string;
  evidenceIds: string[];
  domain: DomainAssignment;
  time: EventTime;
  significance: SignificanceScore;
  eligibility: EventEligibility;
  speechAct: SourceSpeechAct;
  entityIds: {
    characters: string[];
    locations: string[];
    organizations: string[];
  };
  pipelineVersion: string;
};

export type EventMergeDecision = {
  candidateIds: string[];
  action: 'merge' | 'keep_separate' | 'needs_review';
  confidence: number;
  reasons: string[];
  canonicalTitle?: string;
};

export type TimelineBuildTrace = {
  pipelineVersion: string;
  evidenceCount: number;
  rejectedEvidenceCount: number;
  rejectionReasons: Record<string, number>;
  canonicalEventCount: number;
  duplicateClusterCount: number;
  domainDistribution: Record<string, number>;
  temporalPrecisionDistribution: Record<string, number>;
  messageTimestampFallbackPercent: number;
  arcCount: number;
  chapterCount: number;
  eraCount: number;
  lowConfidenceItemsHidden: number;
  countConsistencyPassed: boolean;
};

export type TimelineRebuildComparison = {
  before: {
    evidenceCount: number;
    eventCount: number;
    arcCount: number;
    chapterCount: number;
    eraCount: number;
    otherDomainPercent: number;
  };
  after: {
    evidenceCount: number;
    canonicalEventCount: number;
    arcCount: number;
    chapterCount: number;
    eraCount: number;
    duplicateClusterCount: number;
    rejectedEvidenceCount: number;
    otherDomainPercent: number;
  };
  merges: EventMergeDecision[];
  rejectedItems: Array<{ sourceId: string; reason: string }>;
  preservedUserCorrections: string[];
  conflictsNeedingReview: string[];
  trace: TimelineBuildTrace;
};

export type TimelineQualityReport = {
  duplicateRate: number;
  commandLeakageRate: number;
  malformedTitleRate: number;
  unsupportedChapterRate: number;
  otherDomainRate: number;
  unexplainedSignificanceRate: number;
  fakeDateRangeRate: number;
  brokenReferenceCount: number;
};

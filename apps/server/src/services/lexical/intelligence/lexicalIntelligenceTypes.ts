/** Lexical Intelligence Engine — rich span metadata for extraction quality. */

export type EntityType =
  | 'PERSON'
  | 'PLACE'
  | 'ORGANIZATION'
  | 'GROUP'
  | 'COMMUNITY'
  | 'EVENT'
  | 'TIME_PERIOD'
  | 'DATE'
  | 'ROLE'
  | 'SKILL'
  | 'TASK'
  | 'RELATIONSHIP'
  | 'EMOTION'
  | 'PREFERENCE'
  | 'OBJECT'
  | 'MEDIA'
  | 'LANGUAGE'
  | 'SUBJECT'
  | 'ACTIVITY'
  | 'WORKSITE'
  | 'DEPLOYMENT_SITE'
  | 'SCHOOL'
  | 'SCHOOL_CLUB'
  | 'SCHOOL_TEAM'
  | 'FRIEND_GROUP'
  | 'MUSIC_GENRE'
  | 'VENUE'
  | 'TRAVEL_DESTINATION'
  | 'WEATHER_CONTEXT'
  | 'EMOTIONAL_SIGNIFICANCE'
  | 'INTEREST'
  | 'WORK_ACTIVITY'
  | 'UNKNOWN';

export type DetectionSource = 'pattern' | 'history' | 'alias' | 'model' | 'correction';

export type SpanStatus = 'known' | 'new' | 'inferred' | 'needs_review' | 'ignored';

export type ContextWindow = {
  before: string;
  match: string;
  after: string;
};

export type SpanAlternative = {
  type: EntityType;
  subtype?: string;
  confidence: number;
  reason: string;
};

export type LexicalIntelligenceSpan = {
  id: string;
  text: string;
  start: number;
  end: number;
  type: EntityType;
  subtype?: string;
  confidence: number;
  evidencePhrases: string[];
  contextWindow: ContextWindow;
  detectionSource: DetectionSource;
  alternatives: SpanAlternative[];
  status: SpanStatus;
  /** Rule ids that influenced this span */
  rulesFired?: string[];
  parentSpanId?: string;
  colorKey?: string;
  needsReview?: boolean;
};

export type OverlapResolutionRecord = {
  keptId: string;
  droppedIds: string[];
  reason: string;
};

export type LexicalIntelligenceResult = {
  spans: LexicalIntelligenceSpan[];
  rulesFired: string[];
  overlapsResolved: OverlapResolutionRecord[];
  missedCandidates: Array<{ text: string; reason: string }>;
  warnings: string[];
};

export type LexicalDebugReport = LexicalIntelligenceResult & {
  text: string;
  spanCount: number;
  averageConfidence: number;
};

export type RawSpanCandidate = {
  text: string;
  start: number;
  end: number;
  type: EntityType;
  subtype?: string;
  baseConfidence: number;
  detectionSource: DetectionSource;
  patternId?: string;
  evidencePhrases: string[];
  needsReview?: boolean;
};

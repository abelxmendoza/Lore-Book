/** Timeline stitching — time as metadata glue, not standalone book cards. */

export type AttachedToType =
  | 'event'
  | 'relationship'
  | 'role'
  | 'skill'
  | 'project'
  | 'place_visit'
  | 'school_period'
  | 'work_period'
  | 'relationship_arc'
  | 'narrative_anchor'
  | 'memory';

export type TimePrecision =
  | 'exact'
  | 'day'
  | 'month'
  | 'season'
  | 'year'
  | 'era'
  | 'relative'
  | 'fuzzy'
  | 'recurring'
  | 'unknown';

export type NormalizedTime = {
  startDate?: string;
  endDate?: string;
  date?: string;
  timezone?: string;
  precision: TimePrecision;
  relativeLabel?: string;
  eraLabel?: string;
  schoolDayContext?: string;
  timeOfDay?: string;
  durationHint?: string;
  startHint?: string;
};

export type RecurrencePattern = {
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'irregular';
  dayOfWeek?: string;
  timeOfDay?: string;
  context?: string;
};

export type TimelineAnchor = {
  id: string;
  userId: string;
  attachedToType: AttachedToType;
  attachedToId?: string;
  attachedToLabel?: string;
  phrase: string;
  normalizedTime?: NormalizedTime;
  recurrence?: RecurrencePattern;
  confidence: number;
  evidencePhrase: string;
  sourceMessageId: string;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
};

export type TemporalExpression = {
  phrase: string;
  rawSpan: string;
  kind: 'relative' | 'recurring' | 'era' | 'duration' | 'school_day' | 'time_of_day' | 'fuzzy';
  precision: TimePrecision;
  isStandaloneOnly: boolean;
};

export type StitchAttachmentTarget = {
  attachedToType: AttachedToType;
  attachedToId?: string;
  attachedToLabel: string;
  confidence: number;
};

export type TimelineStitchingInput = {
  text: string;
  sourceMessageId: string;
  userId: string;
  messageTimestamp?: string;
  /** Nearby entity/event/skill labels to attach time to. */
  attachmentCandidates?: StitchAttachmentTarget[];
};

export type TimelineContradictionReview = {
  existingAnchorId?: string;
  existingPhrase: string;
  newPhrase: string;
  attachedToLabel: string;
  attachedToType: AttachedToType;
  reason: string;
};

export type TimelineStitchingResult = {
  anchors: TimelineAnchor[];
  rejectedStandaloneTime: Array<{ phrase: string; reason: string }>;
  contradictions: TimelineContradictionReview[];
  stitchLinks: Array<{ fromLabel: string; toLabel: string; linkType: string }>;
};

/** Phrases that must NEVER become book/card suggestions. */
export const STANDALONE_TIME_PHRASES = new Set([
  'yesterday',
  'last night',
  'today',
  'tonight',
  'last summer',
  'last week',
  'last year',
  'last month',
  'before covid',
  'every wednesday',
  'lunch break',
  'around noon',
  'after school',
  'a few weeks ago',
  'all the time',
]);

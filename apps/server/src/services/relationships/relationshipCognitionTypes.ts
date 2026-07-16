/**
 * Relationship Cognition Engine — types.
 *
 * Relationships are probability distributions over time, not one label.
 * Every dimension moves independently: attraction is not attachment,
 * attachment is not status, and silence is not evidence.
 */

export type RelationshipDimension =
  | 'romantic_interest'
  | 'sexual_attraction'
  | 'emotional_attachment'
  | 'trust'
  | 'friendship'
  | 'conflict'
  | 'avoidance'
  | 'communication'
  | 'curiosity'
  | 'hope'
  | 'grief'
  | 'closure';

export type RomanticStage =
  | 'unknown'
  | 'awareness'
  | 'mild_interest'
  | 'curious'
  | 'crush'
  | 'strong_crush'
  | 'infatuation'
  | 'talking'
  | 'dating'
  | 'situationship'
  | 'hookup'
  | 'friends_with_benefits'
  | 'one_night_stand'
  | 'lover'
  | 'partner'
  | 'fiance'
  | 'spouse'
  | 'former_partner'
  | 'ex'
  | 'rekindling'
  | 'moving_on'
  | 'friend'
  | 'acquaintance'
  | 'blocked'
  | 'no_interest';

export type SexualRelationshipState =
  | 'none'
  | 'kissed'
  | 'made_out'
  | 'sexual_encounter'
  | 'ongoing_sexual_relationship'
  | 'past_sexual_relationship'
  | 'unknown';

/** Ordered by weight: what the user states outright always beats inference. */
export type EvidenceSource =
  | 'user_correction'
  | 'direct_statement'
  | 'relationship_label'
  | 'shared_experience'
  | 'mention'
  | 'speculation';

export type RelationshipEvidence = {
  id: string;
  personId: string;
  text: string;
  /** ISO timestamp when known; undated evidence still counts, just softer. */
  at?: string;
  source: EvidenceSource;
};

export type EmotionalSignal = {
  dimension: RelationshipDimension;
  /** +1 strengthens the dimension, -1 weakens it. */
  polarity: 1 | -1;
  /** 0..1 */
  strength: number;
  excerpt: string;
};

export type BoundaryEventKind =
  | 'rejection'
  | 'ghosting'
  | 'blocking'
  | 'boundary_request'
  | 'breakup'
  | 'argument'
  | 'reconciliation';

export type BoundaryEvent = { kind: BoundaryEventKind; at?: string; excerpt: string };

export type SexualEventKind = 'kissed' | 'made_out' | 'sexual_encounter';

export type SexualEvent = { kind: SexualEventKind; at?: string; excerpt: string };

export type Trajectory =
  | 'growing'
  | 'stable'
  | 'uncertain'
  | 'cooling'
  | 'fading'
  | 'ended'
  | 'rekindling';

export type TrajectoryEstimate = {
  direction: Trajectory;
  /** Probabilistic, never certain. */
  probability: number;
  reasons: string[];
};

export type DimensionScore = {
  dimension: RelationshipDimension;
  /** 0..1 */
  score: number;
  confidence: number;
  reasons: string[];
};

export type InterestScore = {
  /** 0..100 */
  score: number;
  confidence: number;
  reasonBreakdown: string[];
};

export type StagePeriod = {
  stage: RomanticStage;
  confidence: number;
  start?: string;
  end?: string;
  evidenceExcerpts: string[];
};

/** Why decay may be frozen: attention shifted, life happened. */
export type WorkloadState = {
  busyWithWork: boolean;
  busyWithProject: boolean;
  /** The user's journaling dropped across the board — silence is global. */
  globalActivityDrop: boolean;
  reasons: string[];
};

export type RelationshipAttention = {
  /** Emotional references, callbacks, rumination — thinking ≠ mentioning. */
  thinkingScore: number;
  /** Mention/shared-event frequency. */
  talkingScore: number;
  reasons: string[];
};

export type RelationshipSnapshot = {
  personId: string;
  personName: string;
  /** One person can be friend + coworker + former hookup at once. */
  relationshipTypes: string[];
  romanticStage: StagePeriod;
  interest: InterestScore;
  /** Separate from attraction, separate from status. */
  emotionalAttachment: DimensionScore;
  sexualRelationship: {
    state: SexualRelationshipState;
    confidence: number;
    evidenceExcerpts: string[];
  };
  trajectory: TrajectoryEstimate;
  attention: RelationshipAttention;
  confidence: number;
  lastEvidenceAt?: string;
  reasonSummary: string;
};

export type RelationshipPerson = {
  personId: string;
  name: string;
  storedRelationshipTypes: string[];
  closenessScore?: number;
};

export type RelationshipCognitionContext = {
  userId: string;
  people: RelationshipPerson[];
  evidence: RelationshipEvidence[];
  recencyByEntity: Map<string, string>;
  workload: WorkloadState;
  now: string;
};

export type RelationshipQuestionKind =
  | 'romantic_interest'
  | 'relationship_state'
  | 'thinking_about';

export type RelationshipAnswer = {
  kind: RelationshipQuestionKind;
  content: string;
  confidence: number;
  reasoning: string[];
};

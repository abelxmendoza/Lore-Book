// =====================================================
// CONTEXTUAL INTELLIGENCE TYPES
// Purpose: Shared contracts for phase-safe contextual intelligence
// Rules: All operations are confidence-scored, reversible, metadata-only
// =====================================================

export type ConfidenceScore = number; // 0.0 – 1.0

export type ContextLinkType =
  | 'contextual_continuation'
  | 'shared_location'
  | 'shared_participants'
  | 'temporal_overlap';

export type EventContinuityLink = {
  from_event_id: string;
  to_event_id: string;
  link_type: ContextLinkType;
  confidence: ConfidenceScore;
  explanation: string;
  created_at: string;
  metadata?: Record<string, any>;
};

export type EntityResolutionCandidate = {
  reference_text: string;
  resolved_entity_id: string;
  confidence: ConfidenceScore;
  rationale: string;
  metadata?: Record<string, any>;
};

export type HouseholdHypothesis = {
  hypothesis_type: 'cohabitation' | 'dependency' | 'caregiver';
  subject_entity_id: string;
  related_entity_id: string;
  confidence: ConfidenceScore;
  evidence_count: number;
  last_observed_at: string;
  first_observed_at: string;
  metadata?: Record<string, any>;
};

export type AliasHypothesis = {
  alias: string;
  refers_to_entity_ids: string[];
  scope: 'conversation' | 'household' | 'global';
  confidence: ConfidenceScore;
  evidence_count: number;
  last_observed_at: string;
  first_observed_at: string;
  metadata?: Record<string, any>;
};

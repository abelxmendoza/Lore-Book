/**
 * LORE-KEEPER PREDICTIVE CONTINUITY ENGINE (PCE)
 * TypeScript Types
 */

export type PredictionType =
  | 'BEHAVIORAL'
  | 'RELATIONAL'
  | 'CAREER'
  | 'EMOTIONAL'
  | 'DECISION_OUTCOME'
  | 'PATTERN_CONTINUATION';

export type PredictionScope = 'ENTITY' | 'SELF' | 'RELATIONSHIP' | 'TIME';

export type TimeHorizon = 'SHORT' | 'MEDIUM' | 'LONG';

export type PredictionEvidenceSourceType =
  | 'DECISION_HISTORY'
  | 'OUTCOME_HISTORY'
  | 'INSIGHT_PATTERN'
  | 'TEMPORAL_TREND';

export interface Prediction {
  id: string;
  user_id: string;
  title: string;
  description: string;
  probability: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  prediction_type: PredictionType;
  scope: PredictionScope;
  related_entity_ids: string[];
  related_decision_ids: string[];
  related_insight_ids: string[];
  related_claim_ids: string[];
  time_horizon: TimeHorizon;
  generated_at: string;
  dismissed: boolean;
  metadata?: Record<string, any>;
}

export interface PredictionEvidence {
  id: string;
  user_id: string;
  prediction_id: string;
  source_type: PredictionEvidenceSourceType;
  reference_id: string;
  explanation: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface PredictionWithEvidence {
  prediction: Prediction;
  evidence: PredictionEvidence[];
}

export interface PredictionInput {
  title: string;
  description: string;
  probability: number;
  confidence: number;
  prediction_type: PredictionType;
  scope: PredictionScope;
  related_entity_ids?: string[];
  related_decision_ids?: string[];
  related_insight_ids?: string[];
  related_claim_ids?: string[];
  time_horizon: TimeHorizon;
}

export interface PredictionContext {
  entity_ids?: string[];
  decision_ids?: string[];
  insight_ids?: string[];
  claim_ids?: string[];
  message?: string;
}

const MIN_SAMPLE_SIZE = 3; // Minimum decisions needed for prediction

export { MIN_SAMPLE_SIZE };


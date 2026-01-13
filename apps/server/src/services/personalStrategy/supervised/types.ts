/**
 * Supervised Learning Types
 */

export type PatternType =
  | 'growth'
  | 'maintenance'
  | 'recovery'
  | 'avoidance_spiral'
  | 'burnout_risk'
  | 'stagnation';

export type ActionOutcome = 'positive' | 'neutral' | 'negative';

export interface TrainingExample {
  features: number[];
  label: string | number;
}

export interface ModelWeights {
  [key: string]: number;
}

export interface ModelMetadata {
  model_id: string;
  model_type: 'pattern_classifier' | 'outcome_predictor' | 'alignment_regressor';
  user_id: string;
  version: number;
  accuracy?: number;
  trained_at: string;
  feature_names: string[];
  hyperparameters: Record<string, any>;
}

export interface PatternPrediction {
  pattern: PatternType;
  confidence: number;
  probabilities: Record<PatternType, number>;
}

export interface OutcomePrediction {
  outcome: ActionOutcome;
  confidence: number;
  probabilities: Record<ActionOutcome, number>;
}

export interface AlignmentImpactPrediction {
  alignment_delta: number; // Expected change in alignment (-1 to 1)
  confidence: number;
}

/**
 * LORE-KEEPER DECISION MEMORY ENGINE (DME)
 * TypeScript Types
 */

export type DecisionType =
  | 'RELATIONSHIP'
  | 'CAREER'
  | 'HEALTH'
  | 'FINANCIAL'
  | 'CREATIVE'
  | 'SOCIAL'
  | 'PERSONAL'
  | 'OTHER';

export type OutcomeSentiment = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'UNCLEAR';

export interface Decision {
  id: string;
  user_id: string;
  title: string;
  description: string;
  decision_type: DecisionType;
  entity_ids: string[];
  related_claim_ids: string[];
  related_insight_ids: string[];
  perspective_id?: string | null;
  created_at: string;
  confidence: number; // 0.0 - 1.0
  uncertainty_notes?: string | null;
  metadata?: Record<string, any>;
}

export interface DecisionOption {
  id: string;
  user_id: string;
  decision_id: string;
  option_text: string;
  perceived_risks?: string;
  perceived_rewards?: string;
  confidence?: number;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionRationale {
  id: string;
  user_id: string;
  decision_id: string;
  reasoning: string;
  values_considered: string[];
  emotions_present: string[];
  constraints: string[];
  known_unknowns?: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionOutcome {
  id: string;
  user_id: string;
  decision_id: string;
  outcome_text: string;
  recorded_at: string;
  sentiment?: OutcomeSentiment;
  linked_claim_ids: string[];
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionSummary {
  decision: Decision;
  options: DecisionOption[];
  rationale?: DecisionRationale;
  outcomes: DecisionOutcome[];
}

export interface DecisionInput {
  title: string;
  description: string;
  decision_type: DecisionType;
  entity_ids?: string[];
  related_claim_ids?: string[];
  related_insight_ids?: string[];
  perspective_id?: string;
  confidence?: number;
  uncertainty_notes?: string;
}

export interface DecisionOptionInput {
  option_text: string;
  perceived_risks?: string;
  perceived_rewards?: string;
  confidence?: number;
}

export interface DecisionRationaleInput {
  reasoning: string;
  values_considered?: string[];
  emotions_present?: string[];
  constraints?: string[];
  known_unknowns?: string;
}

export interface DecisionOutcomeInput {
  outcome_text: string;
  sentiment?: OutcomeSentiment;
  linked_claim_ids?: string[];
}


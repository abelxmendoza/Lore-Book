/**
 * Decision Support Engine Type Definitions
 */

export type DecisionInsightType =
  | 'decision_detected'
  | 'pattern_detected'
  | 'similar_decision'
  | 'risk_warning'
  | 'consequence_prediction'
  | 'recommendation';

export interface Decision {
  id?: string;
  user_id?: string;
  description: string;
  timestamp: string;
  category?: string;
  outcome?: 'positive' | 'negative' | 'neutral' | 'unknown';
  risk_level?: number; // 0-1
  similarity_matches?: string[]; // IDs of similar decisions
  predicted_consequences?: string[];
  context?: string;
  alternatives_considered?: string[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface DecisionInsight {
  id?: string;
  user_id?: string;
  type: DecisionInsightType;
  message: string;
  confidence: number; // 0-1
  timestamp: string;
  decision_id: string;
  metadata?: Record<string, any>;
}

export interface DecisionContext {
  entries?: any[];
  chronology?: any;
  insights?: any;
  learning?: any;
  relationships?: any;
  continuity?: any;
}

export interface DecisionStats {
  total_decisions: number;
  decisions_by_outcome: Record<string, number>;
  decisions_by_category: Record<string, number>;
  average_risk_level: number;
  high_risk_decisions: number;
  recurring_patterns: number;
}


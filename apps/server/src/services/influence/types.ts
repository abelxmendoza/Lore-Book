/**
 * Influence Engine Type Definitions
 */

export type InfluenceInsightType =
  | 'toxic_pattern'
  | 'positive_influence'
  | 'high_risk_person'
  | 'uplifting_person'
  | 'dominant_influence'
  | 'behavior_shift_detected'
  | 'relationship_power_shift'
  | 'influence_score';

export interface PersonInfluence {
  id?: string;
  user_id?: string;
  person: string;
  emotional_impact: number; // -1 to +1
  behavioral_impact: number; // negative or positive habit formation
  frequency: number;
  toxicity_score: number; // 0-1
  uplift_score: number; // 0-1
  net_influence: number; // combined weighted score
  interaction_count: number;
  first_interaction?: string;
  last_interaction?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface InfluenceEvent {
  id?: string;
  user_id?: string;
  timestamp: string;
  person: string;
  text: string;
  sentiment: number; // -1 to +1
  behavior_tags: string[];
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface InfluenceInsight {
  id?: string;
  user_id?: string;
  type: InfluenceInsightType;
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  person?: string;
  metadata?: Record<string, any>;
}

export interface InfluenceContext {
  entries?: any[];
  relationships?: any;
  identity_pulse?: any;
  timeline?: any;
  continuity?: any;
}

export interface InfluenceStats {
  total_people: number;
  toxic_people: number;
  uplifting_people: number;
  average_net_influence: number;
  most_positive_influence: string | null;
  most_negative_influence: string | null;
  total_interactions: number;
}


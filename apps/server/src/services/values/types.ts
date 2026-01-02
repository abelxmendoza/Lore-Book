/**
 * Values & Beliefs Engine Type Definitions
 */

export type ValueCategory =
  | 'discipline'
  | 'loyalty'
  | 'honor'
  | 'ambition'
  | 'freedom'
  | 'growth'
  | 'courage'
  | 'creativity'
  | 'justice'
  | 'family'
  | 'authenticity'
  | 'adventure'
  | 'stability'
  | 'independence'
  | 'community'
  | 'wisdom'
  | 'compassion'
  | 'excellence'
  | 'other';

export type ValueInsightType =
  | 'core_value_detected'
  | 'value_conflict'
  | 'value_shift'
  | 'belief_shift'
  | 'misalignment'
  | 'reinforced_value'
  | 'emerging_value'
  | 'identity_rewrite';

export interface ValueSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  category: ValueCategory;
  strength: number; // 0-1 value intensity
  text: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface BeliefSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  statement: string;
  polarity: number; // -1 to 1 (negative to positive)
  confidence: number; // 0-1 belief certainty
  entry_id?: string;
  is_explicit?: boolean; // true if "I believe..." statement
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface ValueInsight {
  id?: string;
  user_id?: string;
  type: ValueInsightType;
  message: string;
  category?: ValueCategory;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface ValueEvolutionPoint {
  timestamp: string;
  category: ValueCategory;
  strength: number;
}

export interface BeliefEvolutionPoint {
  timestamp: string;
  statement: string;
  polarity: number;
  confidence: number;
}

export interface ValuesOutput {
  coreValues: string[];
  valueClusters: Record<string, ValueSignal[]>;
  beliefStatements: BeliefSignal[];
  conflicts: string[];
  misalignments: string[];
  evolution: {
    values: ValueEvolutionPoint[];
    beliefs: BeliefEvolutionPoint[];
  };
  insights: ValueInsight[];
  valueSignals?: ValueSignal[];
  beliefSignals?: BeliefSignal[];
}

export interface ValuesContext {
  entries?: any[];
  chronology?: any;
  continuity?: any;
  identity_pulse?: any;
  relationships?: any;
}

export interface ValuesStats {
  total_value_signals: number;
  total_belief_signals: number;
  core_values_count: number;
  conflicts_count: number;
  misalignments_count: number;
  top_values: Array<{ category: ValueCategory; score: number }>;
}


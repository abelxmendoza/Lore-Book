/**
 * Personal Strategy Engine Types
 * Maps blueprint concepts to LoreKeeper architecture
 */

export type ActionType = 
  | 'train'           // Physical training (BJJ, gym, etc.)
  | 'code'            // Coding/robotics work
  | 'rest'            // Rest/recovery
  | 'socialize'       // Social activities
  | 'reflect'         // Journaling, reflection
  | 'learn'           // Learning/studying
  | 'create'          // Creative work (art, music, writing)
  | 'work'            // Professional work
  | 'avoid'           // Avoidance behaviors (negative)
  | 'consume_noise'   // Time-wasting activities (negative)
  | 'plan'            // Planning/organizing
  | 'maintain'        // Maintenance tasks
  | 'explore'         // Exploration/new experiences
  | 'connect'         // Relationship building
  | 'heal'            // Healing/recovery activities
  | 'grow'            // Personal growth activities
  | 'serve'           // Helping others
  | 'play'            // Play/leisure
  | 'unknown';        // Unclassified

export interface Action {
  id: string;
  type: ActionType;
  timestamp: string;
  duration_minutes?: number;
  intensity?: number; // 0.0 to 1.0
  context: {
    location?: string;
    people?: string[];
    goal_ids?: string[];
    value_ids?: string[];
    entry_id?: string;
  };
  outcome?: 'positive' | 'neutral' | 'negative' | 'unknown';
  metadata: Record<string, any>;
}

export interface RLStateVector {
  // Mood & Energy (from emotional intelligence)
  mood: number; // -1.0 to 1.0
  energy: number; // 0.0 to 1.0
  stress: number; // 0.0 to 1.0
  
  // Physical State
  sleep_hours?: number;
  health_score?: number; // 0.0 to 1.0
  
  // Behavioral State
  last_actions: string[]; // Recent activities
  consistency_score: number; // 0.0 to 1.0 (habit streaks)
  identity_alignment: number; // 0.0 to 1.0 (values/goals alignment)
  
  // Temporal State
  time_of_day: number; // 0-23
  day_of_week: number; // 0-6
  days_since_last_entry: number;
  
  // Goal State
  active_goals_count: number;
  goal_progress_score: number; // 0.0 to 1.0
  goal_at_risk_count: number;
  
  // Relationship State
  social_activity_score: number; // 0.0 to 1.0
  relationship_health_score: number; // 0.0 to 1.0
  
  // Supervised Learning Features (added by models)
  pattern_type?: PatternType;
  predicted_alignment_delta?: number;
}

export type PatternType =
  | 'growth'
  | 'maintenance'
  | 'recovery'
  | 'avoidance_spiral'
  | 'burnout_risk'
  | 'stagnation';

export interface RewardWeights {
  consistency_weight: number;      // Default: 0.3
  progress_weight: number;          // Default: 0.4
  alignment_weight: number;         // Default: 0.3
  anxiety_weight: number;          // Default: 0.2 (negative)
  avoidance_weight: number;        // Default: 0.3 (negative)
  growth_weight: number;           // Default: 0.2
  relationship_weight: number;      // Default: 0.1
}

export interface ActionRecommendation {
  recommended_action: ActionType;
  confidence: number;
  reason: string;
  alternatives: Array<{ action: ActionType; score: number }>;
  state_snapshot_id?: string;
  predicted_outcome?: 'positive' | 'neutral' | 'negative';
  predicted_outcome_confidence?: number;
  predicted_alignment_impact?: number;
}

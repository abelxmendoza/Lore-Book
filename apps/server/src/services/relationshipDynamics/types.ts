/**
 * Relationship Dynamics Engine Type Definitions
 */

export type RelationshipStage =
  | 'forming'
  | 'developing'
  | 'established'
  | 'deepening'
  | 'maintaining'
  | 'declining'
  | 'distant'
  | 'reconnecting'
  | 'ended';

export type RelationshipHealth = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export type InteractionType = 'positive' | 'neutral' | 'negative' | 'conflict' | 'support';

export interface RelationshipInteraction {
  entry_id: string;
  date: string;
  sentiment: number; // -1 to 1
  interaction_type: InteractionType;
  context?: string;
  topics?: string[];
}

export interface RelationshipMetrics {
  interaction_frequency: number; // Interactions per month
  average_sentiment: number; // -1 to 1
  sentiment_trend: 'improving' | 'declining' | 'stable' | 'volatile';
  positive_ratio: number; // 0 to 1
  conflict_frequency: number; // Conflicts per month
  support_frequency: number; // Support interactions per month
  last_interaction_days_ago: number;
  interaction_consistency: number; // 0 to 1
}

export interface RelationshipHealthScore {
  overall_health: RelationshipHealth;
  health_score: number; // 0 to 100
  factors: {
    sentiment: number;
    frequency: number;
    consistency: number;
    conflict_level: number;
    support_level: number;
  };
  trends: {
    health_trend: 'improving' | 'declining' | 'stable';
    sentiment_trend: 'improving' | 'declining' | 'stable';
    frequency_trend: 'increasing' | 'decreasing' | 'stable';
  };
  concerns?: string[];
  strengths?: string[];
}

export interface RelationshipLifecycle {
  current_stage: RelationshipStage;
  stage_history: Array<{
    stage: RelationshipStage;
    start_date: string;
    end_date?: string;
    duration_days: number;
  }>;
  transitions: Array<{
    from_stage: RelationshipStage;
    to_stage: RelationshipStage;
    date: string;
    trigger?: string;
  }>;
  stage_confidence: number; // 0 to 1
}

export interface RelationshipDynamics {
  id?: string;
  user_id: string;
  person_name: string;
  metrics: RelationshipMetrics;
  health: RelationshipHealthScore;
  lifecycle: RelationshipLifecycle;
  interactions: RelationshipInteraction[];
  first_mentioned: string;
  last_mentioned: string;
  total_interactions: number;
  common_topics: string[];
  relationship_type?: string; // friend, family, colleague, etc.
  metadata: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface RelationshipInsight {
  type: 'health_change' | 'stage_transition' | 'pattern_detected' | 'recommendation';
  title: string;
  description: string;
  person_name: string;
  severity: 'info' | 'warning' | 'critical';
  actionable: boolean;
  recommendation?: string;
  metadata: Record<string, any>;
}

export interface RelationshipStats {
  total_relationships: number;
  by_stage: Record<RelationshipStage, number>;
  by_health: Record<RelationshipHealth, number>;
  average_health_score: number;
  relationships_improving: number;
  relationships_declining: number;
  most_active_relationships: Array<{
    person_name: string;
    interaction_count: number;
  }>;
  relationships_needing_attention: string[];
}


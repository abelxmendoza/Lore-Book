/**
 * Recommendation Engine Type Definitions
 */

export type RecommendationType =
  | 'journal_prompt'
  | 'reflection_question'
  | 'action'
  | 'relationship_checkin'
  | 'goal_reminder'
  | 'pattern_exploration'
  | 'gap_filler'
  | 'continuity_followup'
  | 'growth_opportunity'
  | 'legacy_building';

export type RecommendationStatus = 'pending' | 'shown' | 'dismissed' | 'acted_upon';

export type RecommendationSourceEngine =
  | 'continuity'
  | 'chronology'
  | 'identity_pulse'
  | 'relationship_analytics'
  | 'insight_engine'
  | 'prediction_engine'
  | 'shadow_engine'
  | 'essence_profile'
  | 'task_engine'
  | 'autopilot';

export interface RecommendationContext {
  pattern?: string;
  entity?: string; // person, topic, goal, etc.
  timeframe?: string;
  confidence?: number;
  source?: string;
  metadata?: Record<string, any>;
}

export interface RecommendationSource {
  engine: RecommendationSourceEngine;
  data: {
    event_id?: string;
    pattern_id?: string;
    relationship_id?: string;
    goal_id?: string;
    [key: string]: any;
  };
}

export interface Recommendation {
  id: string;
  user_id: string;
  type: RecommendationType;
  title: string;
  description: string;
  context: RecommendationContext;
  priority: number; // 1-10
  confidence: number; // 0-1
  source_engine?: RecommendationSourceEngine;
  source_data?: RecommendationSource['data'];
  status: RecommendationStatus;
  action_taken_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RecommendationPayload {
  recommendations: Recommendation[];
  total: number;
  by_type: Record<RecommendationType, number>;
  metadata?: {
    generated_at: string;
    sources: RecommendationSourceEngine[];
  };
}

export interface RecommendationStats {
  total: number;
  pending: number;
  shown: number;
  dismissed: number;
  acted_upon: number;
  by_type: Record<RecommendationType, number>;
  action_rate: number; // acted_upon / shown
  avg_confidence: number;
}


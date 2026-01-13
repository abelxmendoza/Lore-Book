/**
 * Will Engine Type Definitions
 * Tracks agency moments where action != impulse
 */

export interface WillEvent {
  id?: string;
  user_id: string;
  timestamp: string;
  source_entry_id?: string | null;
  source_component_id?: string | null;
  
  // Core Will fields
  situation: string;
  inferred_impulse: string;
  observed_action: string;
  cost: number; // 0-1, estimated cost of override
  meaning?: string | null;
  confidence: number; // 0-1, how certain we are this was will
  
  // Context
  emotion_at_time?: string[] | null;
  identity_pressure?: string | null;
  related_decision_id?: string | null;
  
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface WillProcessingContext {
  entry: {
    id: string;
    content: string;
    date: string;
    user_id: string;
  };
  emotion_events?: Array<{
    emotion: string;
    intensity: number;
    polarity: string;
  }>;
  identity_statements?: Array<{
    claim: string;
    confidence: number;
  }>;
  past_patterns?: Array<{
    pattern: string;
    frequency: number;
  }>;
  follow_up_entries?: Array<{
    content: string;
    date: string;
  }>;
}

export interface AgencyMetrics {
  density: number; // will_events per time period
  trend: 'increasing' | 'decreasing' | 'stable';
  last_event?: string | null;
  total_events: number;
}

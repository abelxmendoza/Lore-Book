/**
 * Intervention Engine Type Definitions
 */

export type InterventionType =
  | 'mood_spiral'
  | 'negative_pattern'
  | 'identity_drift'
  | 'relationship_drift'
  | 'abandoned_goal'
  | 'contradiction'
  | 'risk_event'
  | 'contextual_warning';

export type InterventionSeverity = 'low' | 'medium' | 'high' | 'critical';

export type InterventionStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed';

export interface Intervention {
  id?: string;
  user_id?: string;
  type: InterventionType;
  severity: InterventionSeverity;
  confidence: number; // 0-1
  message: string;
  timestamp: string;
  related_events?: string[];
  related_entries?: string[];
  context?: Record<string, any>;
  status?: InterventionStatus;
  acknowledged_at?: string;
  resolved_at?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface InterventionContext {
  events?: any[];
  chronology?: any;
  continuity?: any;
  identityPulse?: any;
  relationshipAnalytics?: any;
  relationshipDynamics?: any;
  goals?: any;
  emotionalPatterns?: any;
  prediction?: any;
  recommendations?: any;
  learning?: any;
  wisdom?: any;
}

export interface InterventionStats {
  total_interventions: number;
  by_type: Record<InterventionType, number>;
  by_severity: Record<InterventionSeverity, number>;
  by_status: Record<InterventionStatus, number>;
  critical_count: number;
  unresolved_count: number;
}


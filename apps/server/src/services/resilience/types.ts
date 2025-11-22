/**
 * Resilience Engine Type Definitions
 */

export type SetbackSeverity = 'low' | 'medium' | 'high';

export type ResilienceInsightType =
  | 'setback_detected'
  | 'recovery_started'
  | 'recovery_completed'
  | 'emotional_recovery'
  | 'behavioral_recovery'
  | 'growth_from_adversity'
  | 'resilience_score'
  | 'resilience_breakthrough'
  | 'chronic_stress_pattern'
  | 'emotional_cycling'
  | 'self_sabotage_loop';

export interface Setback {
  id?: string;
  user_id?: string;
  timestamp: string;
  reason: string;
  severity: SetbackSeverity;
  category?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface RecoveryEvent {
  setback_id: string;
  recovery_start: string;
  recovery_end?: string;
  emotional_trajectory?: number[];
  behavioral_changes?: string[];
  recovery_duration_days?: number;
  metadata?: Record<string, any>;
}

export interface ResilienceInsight {
  id?: string;
  user_id?: string;
  type: ResilienceInsightType;
  message: string;
  confidence: number; // 0-1
  timestamp: string;
  related_setback_id?: string;
  metadata?: Record<string, any>;
}

export interface ResilienceContext {
  entries?: any[];
  chronology?: any;
  identity_pulse?: any;
  insights?: any;
  continuity?: any;
}

export interface ResilienceStats {
  total_setbacks: number;
  setbacks_by_severity: Record<SetbackSeverity, number>;
  total_recoveries: number;
  average_recovery_days: number;
  resilience_score: number; // 0-1
  growth_events: number;
  emotional_recoveries: number;
  behavioral_recoveries: number;
}

// New blueprint types
export type SetbackType =
  | 'emotional'
  | 'physical'
  | 'social'
  | 'career'
  | 'relationship'
  | 'identity';

export interface SetbackSignal {
  id: string;
  timestamp: string;
  type: SetbackType;
  severity: number; // 0-1
  text: string;
  user_id?: string;
  entry_id?: string;
  metadata?: Record<string, any>;
}

export interface RecoverySignal {
  timestamp: string;
  improvement: number; // 0-1 improvement since setback
  setback_id?: string;
  recovery_duration_days?: number;
  metadata?: Record<string, any>;
}

export interface ResilienceOutput {
  resilienceScore: number;
  recoverySpeed: number;
  highStressPeriods: string[];
  insights: ResilienceInsight[];
  setbacks?: SetbackSignal[];
  recovery?: RecoverySignal[];
  timeline?: ResilienceTimelinePoint[];
  coping?: CopingStrategies;
}

export interface ResilienceTimelinePoint {
  timestamp: string;
  setback: number; // 0-1
  recovery: number; // 0-1
  resilience?: number; // calculated resilience at this point
}

export interface CopingStrategies {
  positive: string[];
  negative: string[];
  positive_count: number;
  negative_count: number;
  ratio: number; // positive / negative
}


/**
 * Growth Trajectory Engine Type Definitions
 */

export type GrowthDomain =
  | 'fitness'
  | 'career'
  | 'relationships'
  | 'mindset'
  | 'discipline'
  | 'creativity'
  | 'learning'
  | 'health'
  | 'financial'
  | 'social'
  | 'other';

export type GrowthInsightType =
  | 'level_up'
  | 'plateau'
  | 'breakthrough'
  | 'regression'
  | 'growth_velocity_spike'
  | 'identity_shift'
  | 'domain_mastery'
  | 'stagnation_zone';

export interface GrowthSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  domain: GrowthDomain;
  intensity: number; // 0-1 strength of level-up moment
  direction: 1 | -1; // positive or downward growth
  text: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface GrowthTrajectoryPoint {
  timestamp: string;
  domain: GrowthDomain;
  value: number; // composite growth metric
}

export interface GrowthInsight {
  id?: string;
  user_id?: string;
  type: GrowthInsightType;
  message: string;
  domain?: GrowthDomain;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface GrowthDomainResult {
  domain: GrowthDomain;
  velocity: number;
  score: number;
  signal_count: number;
  timeline: Array<{
    timestamp: string;
    intensity: number;
    direction: 1 | -1;
  }>;
  metadata?: Record<string, any>;
}

export interface GrowthContext {
  entries?: any[];
  identity_pulse?: any;
  chronology?: any;
  relationships?: any;
  continuity?: any;
}

export interface GrowthStats {
  total_signals: number;
  domains_active: number;
  average_velocity: number;
  total_breakthroughs: number;
  total_plateaus: number;
  fastest_growing_domain: GrowthDomain | null;
  most_stagnant_domain: GrowthDomain | null;
  overall_growth_score: number;
}


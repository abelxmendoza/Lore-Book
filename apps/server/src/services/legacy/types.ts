/**
 * Legacy Engine Type Definitions
 */

export type LegacyDomain =
  | 'craft'
  | 'martial'
  | 'tech'
  | 'family'
  | 'mentor'
  | 'impact'
  | 'identity'
  | 'heritage'
  | 'teaching'
  | 'art'
  | 'other';

export type LegacyInsightType =
  | 'legacy_foundation'
  | 'legacy_shift'
  | 'legacy_strengthening'
  | 'legacy_fragility'
  | 'legacy_conflict'
  | 'legacy_breakthrough'
  | 'legacy_contradiction';

export interface LegacySignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  domain: LegacyDomain;
  intensity: number; // 0-1 impact strength
  direction: 1 | -1; // positive or negative legacy moment
  text: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface LegacyCluster {
  id?: string;
  user_id?: string;
  theme: string;
  keywords: string[];
  signals: LegacySignal[];
  significance: number; // 0-1
  domain?: LegacyDomain;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface LegacyTrajectoryPoint {
  timestamp: string;
  significance: number;
}

export interface LegacyInsight {
  id?: string;
  user_id?: string;
  type: LegacyInsightType;
  message: string;
  domain?: LegacyDomain;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface LegacyDomainResult {
  domain: LegacyDomain;
  score: number; // -1 to +1
  trajectory: LegacyTrajectoryPoint[];
  signal_count: number;
  positive_signals: number;
  negative_signals: number;
  metadata?: Record<string, any>;
}

export interface LegacyContext {
  entries?: any[];
  chronology?: any;
  continuity?: any;
  arcs?: any;
  identity_pulse?: any;
  relationships?: any;
}

export interface LegacyStats {
  total_signals: number;
  domains_active: number;
  average_significance: number;
  strongest_domain: LegacyDomain | null;
  most_fragile_domain: LegacyDomain | null;
  total_clusters: number;
  overall_legacy_score: number;
}


/**
 * Identity Core Engine Type Definitions
 */

export type IdentitySignalType =
  | 'value'
  | 'belief'
  | 'desire'
  | 'fear'
  | 'strength'
  | 'weakness'
  | 'self_label'
  | 'shadow'
  | 'aspiration'
  | 'identity_statement';

export interface IdentitySignal {
  id?: string;
  type: IdentitySignalType;
  text: string;
  evidence: string;
  timestamp: string;
  weight: number; // emotional / narrative weight
  confidence: number; // 0-1
  embedding?: number[];
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface IdentityDimension {
  id?: string;
  name: string; // e.g. "Warrior", "Creator", "Rebel"
  score: number; // 0-1
  signals: IdentitySignal[];
  user_id?: string;
  profile_id?: string;
  created_at?: string;
}

export interface IdentityConflict {
  id?: string;
  conflictName: string;
  positiveSide: string;
  negativeSide: string;
  evidence: string[];
  tension: number;
  user_id?: string;
  profile_id?: string;
  created_at?: string;
}

export interface IdentityStability {
  volatility: number; // identity drift
  anchors: string[]; // stable identity pieces
  unstableTraits: string[];
}

export interface IdentityProjection {
  trajectory: string[];
  predictedIdentity: string;
}

export interface IdentityCoreProfile {
  id?: string;
  dimensions: IdentityDimension[];
  conflicts: IdentityConflict[];
  stability: IdentityStability;
  projection: IdentityProjection;
  summary: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}


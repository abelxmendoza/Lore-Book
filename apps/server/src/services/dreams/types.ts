/**
 * Dreams & Aspirations Engine Type Definitions
 */

export type DreamCategory =
  | 'career'
  | 'creative'
  | 'martial'
  | 'relationship'
  | 'financial'
  | 'personal'
  | 'lifestyle'
  | 'legacy'
  | 'health'
  | 'education'
  | 'adventure'
  | 'family'
  | 'other';

export type DreamInsightType =
  | 'core_dream_detected'
  | 'dream_shift'
  | 'dream_strengthening'
  | 'dream_conflict'
  | 'dream_decay'
  | 'dream_alignment'
  | 'aspiration_reinforced';

export interface DreamSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  category: DreamCategory;
  clarity: number; // 0-1 clarity score
  desire: number; // 0-1 intensity of wanting
  text: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface AspirationSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  statement: string;
  polarity: number; // -1 to 1 sentiment polarity
  confidence: number; // 0-1 certainty of desire
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface DreamInsight {
  id?: string;
  user_id?: string;
  type: DreamInsightType;
  message: string;
  category?: DreamCategory;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface DreamTrajectoryPoint {
  timestamp: string;
  clarity: number;
  desire: number;
  category: DreamCategory;
}

export interface DreamsOutput {
  coreDreams: string[];
  clusters: Record<string, DreamSignal[]>;
  aspirations: AspirationSignal[];
  conflicts: string[];
  evolution: Record<string, string[]>;
  futureProjection?: any;
  insights: DreamInsight[];
  dreamSignals?: DreamSignal[];
  aspirationSignals?: AspirationSignal[];
  trajectory?: DreamTrajectoryPoint[];
}

export interface DreamsContext {
  entries?: any[];
  chronology?: any;
  continuity?: any;
  identity_pulse?: any;
  values?: any;
}

export interface DreamsStats {
  total_dream_signals: number;
  total_aspiration_signals: number;
  core_dreams_count: number;
  conflicts_count: number;
  average_clarity: number;
  average_desire: number;
  top_dreams: Array<{ category: DreamCategory; score: number }>;
}


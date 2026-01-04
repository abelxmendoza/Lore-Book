/**
 * LORE-KEEPER GOAL TRACKING & VALUE ALIGNMENT ENGINE (GVAE)
 * TypeScript Types
 */

export type GoalType =
  | 'PERSONAL'
  | 'CAREER'
  | 'RELATIONSHIP'
  | 'HEALTH'
  | 'FINANCIAL'
  | 'CREATIVE';

export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';

export type TargetTimeframe = 'SHORT' | 'MEDIUM' | 'LONG';

export type GoalSignalSourceType = 'CLAIM' | 'DECISION' | 'INSIGHT' | 'OUTCOME';

export interface Value {
  id: string;
  user_id: string;
  name: string;
  description: string;
  priority: number; // 0.0 - 1.0
  created_at: string;
  ended_at?: string | null;
  metadata?: Record<string, any>;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  goal_type: GoalType;
  related_value_ids: string[];
  target_timeframe: TargetTimeframe;
  confidence: number; // 0.0 - 1.0
  status: GoalStatus;
  created_at: string;
  ended_at?: string | null;
  metadata?: Record<string, any>;
}

export interface GoalSignal {
  id: string;
  user_id: string;
  goal_id: string;
  source_type: GoalSignalSourceType;
  reference_id: string;
  alignment_score: number; // -1.0 (misaligned) to +1.0 (aligned)
  explanation: string;
  recorded_at: string;
  metadata?: Record<string, any>;
}

export interface AlignmentSnapshot {
  id: string;
  user_id: string;
  goal_id: string;
  alignment_score: number; // -1.0 to +1.0
  confidence: number; // 0.0 - 1.0
  time_window: {
    start: string;
    end: string;
  };
  generated_at: string;
  metadata?: Record<string, any>;
}

export interface GoalWithAlignment {
  goal: Goal;
  signals: GoalSignal[];
  snapshots: AlignmentSnapshot[];
}

export interface ValueInput {
  name: string;
  description: string;
  priority?: number;
}

export interface GoalInput {
  title: string;
  description: string;
  goal_type: GoalType;
  related_value_ids?: string[];
  target_timeframe: TargetTimeframe;
  confidence?: number;
}

export interface DriftObservation {
  title: string;
  description: string;
  disclaimer: string;
  goal_id: string;
  trend: 'downward' | 'upward' | 'stable';
}


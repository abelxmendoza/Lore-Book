/**
 * Time Management Engine Type Definitions
 */

export type TimeCategory =
  | 'work'
  | 'coding'
  | 'gym'
  | 'bjj'
  | 'muay_thai'
  | 'robotics'
  | 'learning'
  | 'family'
  | 'social'
  | 'travel'
  | 'sleep'
  | 'eating'
  | 'rest'
  | 'errands'
  | 'entertainment'
  | 'unknown';

export type ProcrastinationType =
  | 'avoidance'
  | 'delay'
  | 'distraction'
  | 'fatigue'
  | 'low_priority'
  | 'perfectionism'
  | 'overwhelm'
  | 'other';

export type TimeCycleType =
  | 'productivity'
  | 'fatigue'
  | 'focus'
  | 'workload'
  | 'energy';

export interface TimeEvent {
  id?: string;
  user_id?: string;
  timestamp: string;
  durationMinutes?: number;
  category: TimeCategory;
  description: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface TimeBlock {
  id?: string;
  user_id?: string;
  start: string;
  end: string;
  durationMinutes: number;
  category: TimeCategory;
  metadata?: Record<string, any>;
}

export interface ProcrastinationSignal {
  id?: string;
  user_id?: string;
  type: ProcrastinationType;
  evidence: string;
  confidence: number; // 0-1
  timestamp: string;
  category?: TimeCategory;
  metadata?: Record<string, any>;
}

export interface EnergyCurvePoint {
  hour: number; // 0-23
  level: number; // 0-1
  count?: number;
}

export interface TimeCycle {
  cycleType: TimeCycleType;
  rising: string[];
  peak: string[];
  falling: string[];
  rest: string[];
  period_days?: number;
  confidence?: number;
}

export interface TimeScore {
  consistency: number; // 0-1
  efficiency: number; // 0-1
  distribution: number; // 0-1
  focus: number; // 0-1
  overall: number; // 0-1
}

export interface TimeOutput {
  events: TimeEvent[];
  activity: Record<TimeCategory, number>;
  blocks: TimeBlock[];
  procrastination: ProcrastinationSignal[];
  energy: EnergyCurvePoint[];
  cycles: TimeCycle[];
  score: TimeScore;
  insights?: TimeInsight[];
}

export interface TimeInsight {
  id?: string;
  user_id?: string;
  type:
    | 'time_event_detected'
    | 'procrastination_detected'
    | 'energy_peak'
    | 'energy_low'
    | 'time_block_detected'
    | 'cycle_detected'
    | 'efficiency_improvement'
    | 'efficiency_decline'
    | 'focus_window'
    | 'distraction_pattern';
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  category?: TimeCategory;
  metadata?: Record<string, any>;
}

export interface TimeContext {
  entries?: any[];
  chronology?: any;
  identity_pulse?: any;
  creative?: any;
}

export interface TimeStats {
  total_events: number;
  events_by_category: Record<TimeCategory, number>;
  total_blocks: number;
  total_procrastination: number;
  procrastination_by_type: Record<ProcrastinationType, number>;
  average_energy_level: number;
  peak_energy_hour: number;
  time_score: number;
  top_categories: Array<{ category: TimeCategory; count: number }>;
  total_time_minutes: number;
}


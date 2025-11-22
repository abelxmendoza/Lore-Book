/**
 * Habit Formation Engine Type Definitions
 */

export type HabitInsightType =
  | 'habit_detected'
  | 'streak_update'
  | 'habit_loop'
  | 'decay_warning'
  | 'cluster_assignment'
  | 'consistency_prediction';

export interface Habit {
  id?: string;
  user_id?: string;
  action: string;
  trigger?: string;
  reward?: string;
  frequency?: number; // Times per week
  last_performed?: string;
  streak?: number;
  longest_streak?: number;
  decay_risk?: number; // 0-1
  cluster_id?: string;
  category?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface HabitInsight {
  id?: string;
  user_id?: string;
  type: HabitInsightType;
  message: string;
  confidence: number; // 0-1
  timestamp: string;
  habit_id: string;
  metadata?: Record<string, any>;
}

export interface HabitContext {
  entries?: any[];
  chronology?: any;
  insights?: any;
  continuity?: any;
}

export interface HabitStats {
  total_habits: number;
  active_habits: number;
  total_streaks: number;
  average_streak: number;
  longest_streak: number;
  habits_at_risk: number;
  habits_by_category: Record<string, number>;
}



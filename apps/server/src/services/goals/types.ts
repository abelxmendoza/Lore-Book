/**
 * Enhanced Goal Tracking Engine Type Definitions
 */

export type GoalStatus = 'active' | 'paused' | 'abandoned' | 'completed';

export type GoalInsightType =
  | 'progress'
  | 'stagnation'
  | 'dependency_warning'
  | 'milestone'
  | 'success_probability'
  | 'goal_state_change';

export interface Goal {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  created_at: string;
  updated_at: string;
  last_action_at?: string;
  status?: GoalStatus;
  milestones?: GoalMilestone[];
  probability?: number; // 0-1 success probability
  dependencies?: string[]; // Other goal IDs
  source?: 'entry' | 'task' | 'arc' | 'manual';
  source_id?: string;
  metadata?: Record<string, any>;
}

export interface GoalMilestone {
  id: string;
  description: string;
  achieved: boolean;
  achieved_at?: string;
  target_date?: string;
}

export interface GoalInsight {
  id: string;
  user_id?: string;
  type: GoalInsightType;
  message: string;
  confidence: number; // 0-1
  timestamp: string;
  related_goal_id: string;
  metadata?: Record<string, any>;
}

export interface GoalContext {
  entries?: any[];
  chronology?: any;
  continuity?: any;
  arcs?: any;
  insights?: any;
  tasks?: any[];
}

export interface GoalStats {
  total_goals: number;
  by_status: Record<GoalStatus, number>;
  active_goals: number;
  completed_goals: number;
  abandoned_goals: number;
  average_probability: number;
  goals_with_milestones: number;
  goals_with_dependencies: number;
}


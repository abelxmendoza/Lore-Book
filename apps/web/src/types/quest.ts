/**
 * Frontend Quest Type Definitions
 */

export type QuestType = 'main' | 'side' | 'daily' | 'achievement';
export type QuestStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'archived';
export type QuestSource = 'manual' | 'extracted' | 'suggested' | 'imported';

export interface QuestMilestone {
  id: string;
  description: string;
  achieved: boolean;
  achieved_at?: string;
  target_date?: string;
}

export interface Quest {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  quest_type: QuestType;
  priority: number;
  importance: number;
  impact: number;
  difficulty?: number;
  effort_hours?: number;
  status: QuestStatus;
  started_at?: string;
  completed_at?: string;
  abandoned_at?: string;
  completion_notes?: string;
  parent_quest_id?: string;
  related_goal_id?: string;
  related_task_id?: string;
  quest_chain_id?: string;
  progress_percentage: number;
  milestones?: QuestMilestone[];
  reward_description?: string;
  motivation_notes?: string;
  estimated_completion_date?: string;
  actual_completion_date?: string;
  time_spent_hours?: number;
  tags?: string[];
  category?: string;
  source: QuestSource;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
}

export interface QuestHistory {
  id: string;
  quest_id: string;
  user_id?: string;
  event_type: string;
  description?: string;
  progress_before?: number;
  progress_after?: number;
  notes?: string;
  journal_entry_id?: string;
  related_quest_ids?: string[];
  created_at: string;
  metadata?: Record<string, any>;
}

export interface QuestDependency {
  id: string;
  quest_id: string;
  depends_on_quest_id: string;
  dependency_type: string;
  created_at: string;
}

export interface QuestFilters {
  status?: QuestStatus | QuestStatus[];
  quest_type?: QuestType | QuestType[];
  category?: string;
  tags?: string[];
  min_priority?: number;
  min_importance?: number;
  min_impact?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface QuestBoard {
  main_quests: Quest[];
  side_quests: Quest[];
  daily_quests: Quest[];
  completed_quests: Quest[];
  total_count: number;
}

export interface QuestAnalytics {
  total_quests: number;
  active_quests: number;
  completed_quests: number;
  abandoned_quests: number;
  by_type: Record<QuestType, number>;
  by_status: Record<QuestStatus, number>;
  average_completion_time_hours?: number;
  completion_rate: number;
  average_priority: number;
  average_importance: number;
  average_impact: number;
  most_impactful_quests: Quest[];
  quest_activity_timeline: {
    date: string;
    created: number;
    completed: number;
    abandoned: number;
  }[];
}

export interface QuestSuggestion {
  title: string;
  description?: string;
  quest_type: QuestType;
  priority?: number;
  importance?: number;
  impact?: number;
  confidence: number;
  source_entry_id?: string;
  reasoning?: string;
}

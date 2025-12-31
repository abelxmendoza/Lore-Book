// Skill Types
// Gamification system for tracking life progress and learning

export type SkillCategory = 'professional' | 'creative' | 'physical' | 'social' | 'intellectual' | 'emotional' | 'practical' | 'artistic' | 'technical' | 'other';

export interface Skill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_category: SkillCategory;
  current_level: number;
  total_xp: number;
  xp_to_next_level: number;
  description: string | null;
  first_mentioned_at: string;
  last_practiced_at: string | null;
  practice_count: number;
  auto_detected: boolean;
  confidence_score: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillInput {
  skill_name: string;
  skill_category: SkillCategory;
  description?: string;
  auto_detected?: boolean;
  confidence_score?: number;
}

export interface UpdateSkillInput {
  skill_name?: string;
  skill_category?: SkillCategory;
  description?: string;
  is_active?: boolean;
}

export interface SkillProgress {
  id: string;
  skill_id: string;
  user_id: string;
  xp_gained: number;
  level_before: number;
  level_after: number;
  source_type: 'memory' | 'achievement' | 'manual';
  source_id: string | null;
  notes: string | null;
  timestamp: string;
  created_at: string;
}

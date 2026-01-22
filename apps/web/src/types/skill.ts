// Skill Types
// Gamification system for tracking life progress and learning

export type SkillCategory = 'professional' | 'creative' | 'physical' | 'social' | 'intellectual' | 'emotional' | 'practical' | 'artistic' | 'technical' | 'other';

export interface SkillMetadata {
  // Learning Context
  learned_from?: Array<{
    character_id: string;
    character_name: string;
    relationship_type: 'teacher' | 'mentor' | 'peer' | 'self-taught';
    first_mentioned: string;
    evidence_entry_ids: string[];
  }>;
  
  practiced_with?: Array<{
    character_id: string;
    character_name: string;
    practice_count: number;
    last_practiced: string;
    evidence_entry_ids: string[];
  }>;
  
  // Timeline Context
  learned_when?: {
    date: string;
    entry_id: string;
    context: string;
  };
  
  why_started?: {
    reason: string;
    entry_id: string;
    extracted_at: string;
  };
  
  // Timeline Hierarchy Links
  arcs?: Array<{
    arc_id: string;
    arc_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  sagas?: Array<{
    saga_id: string;
    saga_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  eras?: Array<{
    era_id: string;
    era_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  // Location Context
  learned_at?: Array<{
    location_id: string;
    location_name: string;
    first_mentioned: string;
    evidence_entry_ids: string[];
  }>;
  
  practiced_at?: Array<{
    location_id: string;
    location_name: string;
    practice_count: number;
    last_practiced: string;
    evidence_entry_ids: string[];
  }>;
  
  // Calculated Fields
  years_practiced?: number;
  learning_timeline?: Array<{
    date: string;
    event: string;
    entry_id: string;
  }>;
}

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
  metadata: Record<string, unknown> & {
    skill_details?: SkillMetadata;
  };
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

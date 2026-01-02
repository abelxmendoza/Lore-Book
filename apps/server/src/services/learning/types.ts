/**
 * Learning Engine Type Definitions
 */

export type LearningType =
  | 'skill'
  | 'knowledge'
  | 'concept'
  | 'technique'
  | 'tool'
  | 'language'
  | 'framework'
  | 'methodology';

export type LearningSource = 'journal_entry' | 'conversation' | 'project' | 'course' | 'experience';

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface LearningRecord {
  id: string;
  user_id: string;
  type: LearningType;
  name: string; // Name of the skill/knowledge/concept
  description: string; // What was learned
  proficiency: ProficiencyLevel;
  confidence: number; // 0-1, how confident we are this is learning
  source: LearningSource;
  source_id: string; // ID of the journal entry, conversation, etc.
  source_date: string; // When this learning was extracted
  tags: string[]; // Topics/categories this learning relates to
  related_experiences: string[]; // IDs of related journal entries
  related_projects: string[]; // IDs of related projects
  first_mentioned: string; // When this learning first appeared
  last_mentioned: string; // When this learning last appeared
  progress_timeline: LearningProgress[]; // How proficiency has changed over time
  practice_count: number; // How many times this has been practiced/mentioned
  mastery_indicators: string[]; // Evidence of mastery
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LearningProgress {
  date: string;
  proficiency: ProficiencyLevel;
  evidence: string; // What indicates this level
  source_id: string;
}

export interface LearningPattern {
  theme: string; // The learning theme (e.g., "programming", "design", "communication")
  records: string[]; // IDs of learning records
  total_skills: number;
  avg_proficiency: number;
  first_learned: string;
  last_learned: string;
  growth_rate: number; // Skills learned per month
}

export interface LearningGap {
  area: string; // Learning area
  missing_skills: string[]; // Skills that should exist but don't
  related_skills: string[]; // Skills that exist in related areas
  confidence: number; // How confident we are this is a gap
}

export interface LearningPayload {
  learning: LearningRecord[];
  patterns: LearningPattern[];
  gaps: LearningGap[];
  total: number;
  by_type: Record<LearningType, number>;
  by_proficiency: Record<ProficiencyLevel, number>;
  metadata?: {
    extracted_at: string;
    sources: LearningSource[];
  };
}

export interface LearningStats {
  total_skills: number;
  by_type: Record<LearningType, number>;
  by_proficiency: Record<ProficiencyLevel, number>;
  learning_velocity: number; // Skills learned per month
  strongest_areas: string[];
  growth_areas: string[];
  recent_learning: LearningRecord[];
}


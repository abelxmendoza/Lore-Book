/**
 * Context Engine Type Definitions
 */

export type ContextScope = 'moment' | 'day' | 'week' | 'month' | 'year' | 'lifetime';

export interface TemporalContext {
  date: string;
  scope: ContextScope;
  before: string[]; // Entry IDs before this moment
  during: string[]; // Entry IDs during this moment
  after: string[]; // Entry IDs after this moment
  gaps: Array<{
    start: string;
    end: string;
    duration_days: number;
  }>;
}

export interface EmotionalContext {
  mood: string | null;
  sentiment: number; // -1 to 1
  emotional_trajectory: 'rising' | 'falling' | 'stable';
  recent_emotions: Array<{
    date: string;
    mood: string;
    sentiment: number;
  }>;
}

export interface RelationshipContext {
  active_relationships: Array<{
    name: string;
    closeness: number;
    last_interaction: string;
    status: 'rising' | 'falling' | 'stable';
  }>;
  relationship_changes: Array<{
    person: string;
    change: string;
    date: string;
  }>;
}

export interface LearningContext {
  skills_learned: Array<{
    name: string;
    type: string;
    proficiency: string;
    date: string;
  }>;
  learning_velocity: number;
  active_learning_areas: string[];
}

export interface WisdomContext {
  relevant_wisdom: Array<{
    statement: string;
    category: string;
    date: string;
  }>;
  recurring_themes: string[];
}

export interface PatternContext {
  behavioral_patterns: Array<{
    pattern: string;
    frequency: number;
    last_seen: string;
  }>;
  continuity_events: Array<{
    type: string;
    description: string;
    date: string;
  }>;
}

export interface GoalContext {
  active_goals: Array<{
    goal: string;
    status: 'active' | 'at_risk' | 'abandoned';
    last_mentioned: string;
  }>;
  goal_progress: Array<{
    goal: string;
    progress: string;
    date: string;
  }>;
}

export interface RecommendationContext {
  recommendations: Array<{
    type: string;
    title: string;
    description: string;
    priority: number;
  }>;
}

export interface FullContext {
  temporal: TemporalContext;
  emotional: EmotionalContext;
  relationships: RelationshipContext;
  learning: LearningContext;
  wisdom: WisdomContext;
  patterns: PatternContext;
  goals: GoalContext;
  recommendations: RecommendationContext;
  metadata: {
    generated_at: string;
    scope: ContextScope;
    center_date: string;
    sources: string[];
  };
}

export interface ContextQuery {
  userId: string;
  date?: string; // Center date for context
  scope?: ContextScope; // How wide to look
  include?: string[]; // What to include: temporal, emotional, relationships, learning, wisdom, patterns, goals, recommendations
  exclude?: string[]; // What to exclude
}


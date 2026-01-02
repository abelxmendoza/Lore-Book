/**
 * Creative Output Engine Type Definitions
 */

export type CreativeMedium =
  | 'coding'
  | 'art'
  | 'music'
  | 'writing'
  | 'video'
  | 'robotics'
  | 'design'
  | 'performance'
  | 'unknown';

export type CreativeAction =
  | 'created'
  | 'worked_on'
  | 'planned'
  | 'published'
  | 'thought_about'
  | 'abandoned'
  | 'completed';

export type CreativeBlockType =
  | 'emotional'
  | 'perfectionism'
  | 'overwhelm'
  | 'lack_of_clarity'
  | 'time'
  | 'identity'
  | 'motivation'
  | 'technical'
  | 'other';

export type InspirationSourceType =
  | 'person'
  | 'emotion'
  | 'environment'
  | 'media'
  | 'experience'
  | 'idea'
  | 'nature'
  | 'other';

export type CreativeCycleType =
  | 'productivity'
  | 'inspiration'
  | 'execution'
  | 'reflection';

export type ProjectStage =
  | 'seed'
  | 'development'
  | 'execution'
  | 'refinement'
  | 'release'
  | 'dormant'
  | 'abandoned';

export interface CreativeEvent {
  id?: string;
  user_id?: string;
  timestamp: string;
  medium: CreativeMedium;
  action: CreativeAction;
  description: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface FlowState {
  id?: string;
  user_id?: string;
  timestamp: string;
  level: number; // 0-1
  indicators: string[];
  medium?: CreativeMedium;
  duration_minutes?: number;
  metadata?: Record<string, any>;
}

export interface CreativeBlock {
  id?: string;
  user_id?: string;
  type: CreativeBlockType;
  evidence: string;
  confidence: number; // 0-1
  timestamp: string;
  medium?: CreativeMedium;
  resolved?: boolean;
  resolved_at?: string;
  metadata?: Record<string, any>;
}

export interface InspirationSource {
  id?: string;
  user_id?: string;
  type: InspirationSourceType;
  evidence: string;
  weight: number; // 0-1
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface CreativeCycle {
  cycleType: CreativeCycleType;
  phases: {
    rising: string[];
    peak: string[];
    falling: string[];
    rest: string[];
  };
  period_days?: number;
  confidence?: number;
}

export interface ProjectLifecycle {
  id?: string;
  user_id?: string;
  projectName: string;
  stage: ProjectStage;
  indicators: string[];
  first_mentioned?: string;
  last_updated?: string;
  event_count?: number;
  metadata?: Record<string, any>;
}

export interface CreativeScore {
  output: number; // 0-1
  consistency: number; // 0-1
  flow: number; // 0-1
  inspiration: number; // 0-1
  overall: number; // 0-1
}

export interface CreativeOutput {
  events: CreativeEvent[];
  mediums: Record<CreativeMedium, number>;
  flowStates: FlowState[];
  blocks: CreativeBlock[];
  inspiration: InspirationSource[];
  cycles: CreativeCycle[];
  projectStages: ProjectLifecycle[];
  score: CreativeScore;
  insights?: CreativeInsight[];
}

export interface CreativeInsight {
  id?: string;
  user_id?: string;
  type:
    | 'creative_event_detected'
    | 'flow_state_detected'
    | 'creative_block_detected'
    | 'inspiration_source'
    | 'cycle_detected'
    | 'project_stage_change'
    | 'output_increase'
    | 'output_decrease'
    | 'medium_shift';
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  medium?: CreativeMedium;
  metadata?: Record<string, any>;
}

export interface CreativeContext {
  entries?: any[];
  chronology?: any;
  identity_pulse?: any;
  emotional_intelligence?: any;
}

export interface CreativeStats {
  total_events: number;
  events_by_medium: Record<CreativeMedium, number>;
  total_flow_states: number;
  average_flow_level: number;
  total_blocks: number;
  blocks_by_type: Record<CreativeBlockType, number>;
  total_inspiration_sources: number;
  creative_score: number;
  top_mediums: Array<{ medium: CreativeMedium; count: number }>;
  active_projects: number;
}


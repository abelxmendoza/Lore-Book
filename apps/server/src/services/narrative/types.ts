/**
 * Narrative Engine Type Definitions
 */

export type NarrativeType =
  | 'chronological'
  | 'thematic'
  | 'character_focused'
  | 'emotional_arc'
  | 'event_sequence'
  | 'reflection'
  | 'growth_story';

export type NarrativeStyle = 'descriptive' | 'reflective' | 'analytical' | 'poetic' | 'journalistic';

export type NarrativeStatus = 'draft' | 'complete' | 'archived';

export interface NarrativeSegment {
  id: string;
  entry_ids: string[];
  title: string;
  content: string;
  start_date: string;
  end_date: string;
  theme?: string;
  characters?: string[];
  emotional_tone?: string;
  significance?: number; // 0-1
  metadata: Record<string, any>;
}

export interface NarrativeTransition {
  from_segment_id: string;
  to_segment_id: string;
  transition_text: string;
  connection_type: 'temporal' | 'thematic' | 'emotional' | 'causal' | 'character';
  strength: number; // 0-1
}

export interface Narrative {
  id?: string;
  user_id: string;
  type: NarrativeType;
  style: NarrativeStyle;
  title: string;
  summary: string;
  segments: NarrativeSegment[];
  transitions: NarrativeTransition[];
  entry_ids: string[]; // All entries included
  start_date: string;
  end_date: string;
  themes: string[];
  characters: string[];
  emotional_arc?: {
    start: string;
    end: string;
    trajectory: 'rising' | 'falling' | 'stable' | 'cyclical';
  };
  status: NarrativeStatus;
  metadata: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface NarrativeQuery {
  start_date?: string;
  end_date?: string;
  type?: NarrativeType;
  theme?: string;
  character?: string;
  min_entries?: number;
  max_entries?: number;
}

export interface NarrativeStats {
  total_narratives: number;
  by_type: Record<NarrativeType, number>;
  by_status: Record<NarrativeStatus, number>;
  average_segments: number;
  average_length_days: number;
  most_common_themes: string[];
  most_common_characters: string[];
}


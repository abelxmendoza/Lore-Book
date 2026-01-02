export type ContinuityEventType =
  | 'contradiction'
  | 'abandoned_goal'
  | 'arc_shift'
  | 'identity_drift'
  | 'emotional_transition'
  | 'thematic_drift'
  | 'goal_progress'
  | 'goal_reappearance'
  | 'behavioral_loop';

export type ContinuityEvent = {
  id: string;
  user_id: string;
  event_type: ContinuityEventType;
  description: string;
  source_components: string[];
  severity: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type MemoryComponent = {
  id: string;
  component_type: 'event' | 'thought' | 'reflection' | 'decision' | 'relationship_update' | 'worldbuilding' | 'lore_drop' | 'timeline_marker';
  text: string;
  characters_involved: string[];
  location?: string | null;
  timestamp?: string | null;
  tags: string[];
  importance_score: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type ContradictionDetails = {
  event: ContinuityEvent;
  originalComponent: MemoryComponent;
  contradictingComponent: MemoryComponent;
  supportingEvidence: Array<{
    id: string;
    component_id: string;
    text: string;
    date: string;
    confidence_score?: number;
    similarity_score?: number;
  }>;
  contradictingEvidence: Array<{
    id: string;
    component_id: string;
    text: string;
    date: string;
    confidence_score?: number;
    similarity_score?: number;
  }>;
  timelineContext: Array<{
    id: string;
    date: string;
    label: string;
  }>;
};


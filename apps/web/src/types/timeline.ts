/**
 * Timeline Hierarchy Types (Frontend)
 */

export type TimelineLayer = 
  | 'mythos' 
  | 'epoch' 
  | 'era' 
  | 'saga' 
  | 'arc' 
  | 'chapter' 
  | 'scene' 
  | 'action' 
  | 'microaction';

export type SourceType = 'import' | 'manual' | 'ai';

export interface TimelineNode {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  tags: string[];
  source_type: SourceType;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  parent_id?: string | null;
}

export interface CreateTimelineNodePayload {
  title: string;
  description?: string;
  start_date: string;
  end_date?: string | null;
  tags?: string[];
  source_type?: SourceType;
  metadata?: Record<string, unknown>;
  parent_id?: string | null;
}

export interface UpdateTimelineNodePayload {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  parent_id?: string | null;
}

export interface TimelineSearchFilters {
  text?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  parent_id?: string;
  layer_type?: TimelineLayer[];
}

export interface AutoClassificationResult {
  layer: TimelineLayer;
  parent_id: string | null;
  confidence: number;
  reasoning?: string;
}

export interface TimelineNodeWithChildren {
  node: TimelineNode;
  children: TimelineNodeWithChildren[];
  childCount: number;
}

export interface TimelineRecommendation {
  type: 'new_saga' | 'new_arc' | 'merge_chapters' | 'close_node' | 'add_tags';
  message: string;
  node_id?: string;
  suggested_data?: Partial<CreateTimelineNodePayload>;
  confidence: number;
}

// Color mapping for UI
export const LAYER_COLORS: Record<TimelineLayer, string> = {
  mythos: '#6B21A8',      // deep purple
  epoch: '#DC2626',        // crimson
  era: '#D97706',          // gold
  saga: '#0891B2',         // cyan
  arc: '#16A34A',          // green
  chapter: '#2563EB',      // blue
  scene: '#6B7280',        // grey
  action: '#374151',       // dark grey
  microaction: '#000000'   // black
};

export const PARENT_LAYER_MAP: Record<TimelineLayer, TimelineLayer | null> = {
  mythos: null,
  epoch: 'mythos',
  era: 'epoch',
  saga: 'era',
  arc: 'saga',
  chapter: 'arc',
  scene: 'chapter',
  action: 'scene',
  microaction: 'action'
};


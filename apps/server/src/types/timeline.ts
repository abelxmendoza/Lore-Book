/**
 * Timeline Hierarchy Types
 * 9-layer hierarchy: Mythos → Epochs → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions
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

export interface BaseTimelineNode {
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
}

export interface TimelineMythos extends BaseTimelineNode {
  // No parent_id - top level
}

export interface TimelineEpoch extends BaseTimelineNode {
  parent_id: string | null; // References timeline_mythos
}

export interface TimelineEra extends BaseTimelineNode {
  parent_id: string | null; // References timeline_epochs
}

export interface TimelineSaga extends BaseTimelineNode {
  parent_id: string | null; // References timeline_eras
}

export interface TimelineArc extends BaseTimelineNode {
  parent_id: string | null; // References timeline_sagas
}

export interface TimelineChapter extends BaseTimelineNode {
  parent_id: string | null; // References timeline_arcs
}

export interface TimelineScene extends BaseTimelineNode {
  parent_id: string | null; // References chapters
}

export interface TimelineAction extends BaseTimelineNode {
  parent_id: string | null; // References timeline_scenes
}

export interface TimelineMicroAction extends BaseTimelineNode {
  parent_id: string | null; // References timeline_actions
}

export type TimelineNode = 
  | TimelineMythos 
  | TimelineEpoch 
  | TimelineEra 
  | TimelineSaga 
  | TimelineArc 
  | TimelineChapter 
  | TimelineScene 
  | TimelineAction 
  | TimelineMicroAction;

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

export interface TimelineNodeWithChildren<T extends TimelineNode = TimelineNode> {
  node: T;
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

// Layer hierarchy mapping
export const LAYER_HIERARCHY: Record<TimelineLayer, TimelineLayer | null> = {
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

// Parent layer mapping (what layer can be a parent of this layer)
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

// Table name mapping
export const LAYER_TABLE_MAP: Record<TimelineLayer, string> = {
  mythos: 'timeline_mythos',
  epoch: 'timeline_epochs',
  era: 'timeline_eras',
  saga: 'timeline_sagas',
  arc: 'timeline_arcs',
  chapter: 'chapters',
  scene: 'timeline_scenes',
  action: 'timeline_actions',
  microaction: 'timeline_microactions'
};

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


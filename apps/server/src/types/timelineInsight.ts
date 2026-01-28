/**
 * Hierarchy Time Gaps + Parallel Structure Intelligence
 * Types for timeline-context insight (gaps, parallels) used by chat/RAG and biography.
 */

export type InsightTimelineLayer = 'era' | 'saga' | 'arc';

export type HierarchyGapSize = 'short' | 'medium' | 'long';

export interface HierarchyGap {
  parent_node_id: string;
  parent_layer: InsightTimelineLayer;
  start: string;
  end: string;
  duration_days: number;
  size: HierarchyGapSize;
  reason: 'no_children';
}

/** Minimal node shape for insight service (id, layer, user_id, start_date, end_date). */
export interface HierarchyNodeInput {
  id: string;
  layer: InsightTimelineLayer;
  user_id: string;
  start_date: string;
  end_date: string | null;
}

export interface ParallelNode {
  node_id: string;
  node_layer: 'saga' | 'arc';
  overlap_start: string;
  overlap_end: string;
}

/** Relation record for parallel_to (relation_id, other node id/layer). */
export interface ParallelRelationRef {
  relation_id: string;
  other_node_id: string;
  other_node_layer: 'saga' | 'arc';
}

/** When node_layer is 'era', explicit/implicit are always empty. */
export interface ParallelContext {
  node_id: string;
  node_layer: InsightTimelineLayer;
  explicit: ParallelRelationRef[];
  implicit: ParallelNode[];
}

export interface TimelineContextInsight {
  hierarchyGaps: HierarchyGap[];
  parallels: ParallelContext;
}

export interface ChatContextExtension {
  hierarchyGaps?: HierarchyGap[];
  parallelSummary?: {
    explicitCount: number;
    implicitCount: number;
  };
}

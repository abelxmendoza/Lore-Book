/**
 * Unified timeline-context insight: hierarchy gaps + parallel structure.
 * Used by chat/RAG (extendChatContext) and can be consumed by biography.
 */

import { timelineManager } from '../timelineManager';
import { detectHierarchyGaps } from './hierarchyGapDetection';
import type { ChildNodeForGaps } from './hierarchyGapDetection';
import { resolveParallelContext } from './parallelContextResolution';
import type {
  ChatContextExtension,
  HierarchyNodeInput,
  InsightTimelineLayer,
  TimelineContextInsight,
} from '../../types/timelineInsight';

const CONTAINER_LAYERS: InsightTimelineLayer[] = ['era', 'saga', 'arc'];
const PARALLEL_LAYERS: ('saga' | 'arc')[] = ['saga', 'arc'];

/**
 * Build full timeline-context insight for a node: hierarchy gaps + parallels.
 * Node must have id, layer, user_id, start_date, end_date (obtain via timelineManager.getNode).
 */
export async function buildTimelineContextInsight(
  userId: string,
  node: HierarchyNodeInput
): Promise<TimelineContextInsight> {
  const hierarchyGaps: TimelineContextInsight['hierarchyGaps'] = [];
  let parallels: TimelineContextInsight['parallels'];

  if (CONTAINER_LAYERS.includes(node.layer)) {
    const children = await timelineManager.getChildren(userId, node.layer, node.id);
    const childShapes: ChildNodeForGaps[] = children.map((c: { id?: string; start_date: string; end_date?: string | null }) => ({
      id: c.id,
      start_date: c.start_date,
      end_date: c.end_date ?? null,
    }));
    hierarchyGaps.push(...detectHierarchyGaps(node, childShapes));
  }

  if (PARALLEL_LAYERS.includes(node.layer as 'saga' | 'arc')) {
    parallels = await resolveParallelContext(userId, {
      id: node.id,
      layer: node.layer as 'saga' | 'arc',
      user_id: node.user_id,
      start_date: node.start_date,
      end_date: node.end_date,
    });
  } else {
    parallels = {
      node_id: node.id,
      node_layer: node.layer,
      explicit: [],
      implicit: [],
    };
  }

  return { hierarchyGaps, parallels };
}

/**
 * Extend chat context with hierarchy gaps and parallel summary (counts only).
 */
export async function extendChatContext(
  userId: string,
  node: HierarchyNodeInput
): Promise<ChatContextExtension> {
  const insight = await buildTimelineContextInsight(userId, node);
  return {
    hierarchyGaps: insight.hierarchyGaps,
    parallelSummary: {
      explicitCount: insight.parallels.explicit.length,
      implicitCount: insight.parallels.implicit.length,
    },
  };
}

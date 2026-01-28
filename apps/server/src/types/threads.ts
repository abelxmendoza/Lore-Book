/**
 * Recurring Threads / Themes Types
 * Threads group saga/arc nodes; relations model causality (paused_by, parallel_to, etc.).
 */

export type ThreadCategory = 'career' | 'relationship' | 'health' | 'project' | 'custom';

export type ThreadNodeType = 'saga' | 'arc';

export type ThreadRole = 'primary' | 'secondary';

export type NodeRelationType = 'parallel_to' | 'paused_by' | 'displaced_by' | 'influenced_by';

export interface Thread {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: ThreadCategory | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadMembership {
  id: string;
  thread_id: string;
  node_id: string;
  node_type: ThreadNodeType;
  role: ThreadRole | null;
  created_at: string;
}

export interface TimelineNodeRelation {
  id: string;
  user_id: string;
  from_node_id: string;
  from_node_type: ThreadNodeType;
  to_node_id: string;
  to_node_type: ThreadNodeType;
  relation_type: NodeRelationType;
  description: string | null;
  created_at: string;
}

export interface ThreadCreatePayload {
  name: string;
  description?: string;
  category?: ThreadCategory;
}

export interface ThreadUpdatePayload {
  name?: string;
  description?: string;
  category?: ThreadCategory;
}

export interface ThreadFilters {
  category?: ThreadCategory;
}

/** Node snapshot returned by getNodesForThread (id, type, title, start_date, end_date, etc.) */
export interface ThreadNodeSnapshot {
  node_id: string;
  node_type: ThreadNodeType;
  thread_id: string;
  role: ThreadRole | null;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Unified timeline node in a thread (sorted by start_date). */
export type ThreadTimelineNode = ThreadNodeSnapshot;

/** One thread node and the overlapping non-thread nodes ("what interrupted"). */
export interface ThreadInterruptionItem {
  node: ThreadNodeSnapshot;
  overlappingNodes: Array<{ node_id: string; node_type: ThreadNodeType; title: string; start_date: string; end_date: string | null }>;
}

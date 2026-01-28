/**
 * ThreadAssignmentService - Assign threads to a node (manual or assisted).
 * v1: manual only — accept list of thread IDs and create memberships.
 */

import type { ThreadNodeType, ThreadRole } from '../../types/threads';
import { threadMembershipService } from './threadMembershipService';

export interface AssignThreadsOptions {
  confidenceThreshold?: number;
  mode?: 'manual' | 'assisted';
}

export interface AssignThreadsResult {
  id: string;
  thread_id: string;
  node_id: string;
  node_type: ThreadNodeType;
  role: ThreadRole | null;
}

export class ThreadAssignmentService {
  /**
   * Assign threads to a node. v1 manual: all candidateThreadIds are added as memberships.
   */
  async assignThreadsToNode(
    userId: string,
    nodeId: string,
    nodeType: ThreadNodeType,
    candidateThreadIds: string[],
    options?: AssignThreadsOptions
  ): Promise<AssignThreadsResult[]> {
    const mode = options?.mode ?? 'manual';
    if (mode !== 'manual') {
      // Assisted: stub for future LLM/scoring; treat as manual for now
    }

    const results: AssignThreadsResult[] = [];
    for (const threadId of candidateThreadIds) {
      try {
        const m = await threadMembershipService.addMembership(userId, threadId, nodeId, nodeType, 'primary');
        results.push({
          id: m.id,
          thread_id: m.thread_id,
          node_id: m.node_id,
          node_type: m.node_type,
          role: m.role
        });
      } catch (e) {
        // Skip invalid thread or node; caller can inspect results
      }
    }
    return results;
  }
}

export const threadAssignmentService = new ThreadAssignmentService();

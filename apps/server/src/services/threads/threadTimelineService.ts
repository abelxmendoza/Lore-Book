/**
 * ThreadTimelineService - Thread-aware timeline and interruptions.
 * getThreadTimeline: nodes in thread sorted by start_date.
 * getThreadInterruptions: per thread node, overlapping nodes not in thread.
 */

import { supabaseAdmin } from '../supabaseClient';
import { LAYER_TABLE_MAP } from '../../types/timeline';
import type { ThreadNodeType, ThreadNodeSnapshot, ThreadInterruptionItem } from '../../types/threads';
import { threadMembershipService } from './threadMembershipService';

const NODE_TABLE: Record<ThreadNodeType, string> = {
  saga: LAYER_TABLE_MAP.saga,
  arc: LAYER_TABLE_MAP.arc
};

function overlaps(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const aE = aEnd ?? '9999-12-31';
  const bE = bEnd ?? '9999-12-31';
  return aStart < bE && aE > bStart;
}

export class ThreadTimelineService {
  /**
   * All nodes in the thread, sorted by start_date.
   */
  async getThreadTimeline(userId: string, threadId: string): Promise<ThreadNodeSnapshot[]> {
    const nodes = await threadMembershipService.getNodesForThread(userId, threadId);
    return nodes.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
  }

  /**
   * For each thread node, nodes (saga/arc) that overlap its date range and are not in this thread.
   */
  async getThreadInterruptions(userId: string, threadId: string): Promise<ThreadInterruptionItem[]> {
    const threadNodes = await threadMembershipService.getNodesForThread(userId, threadId);
    const threadNodeIds = new Set(threadNodes.map((n) => `${n.node_type}:${n.node_id}`));
    const results: ThreadInterruptionItem[] = [];

    for (const node of threadNodes) {
      const overlapping: Array<{ node_id: string; node_type: ThreadNodeType; title: string; start_date: string; end_date: string | null }> = [];

      for (const table of ['timeline_sagas', 'timeline_arcs'] as const) {
        const typ: ThreadNodeType = table === 'timeline_sagas' ? 'saga' : 'arc';
        const { data: rows } = await supabaseAdmin
          .from(table)
          .select('id, title, start_date, end_date')
          .eq('user_id', userId)
          .lt('start_date', node.end_date ?? '9999-12-31')
          .or(`end_date.gte.${node.start_date},end_date.is.null`);

        const list = (rows ?? []) as Array<{ id: string; title: string; start_date: string; end_date: string | null }>;
        for (const r of list) {
          if (threadNodeIds.has(`${typ}:${r.id}`)) continue;
          if (!overlaps(node.start_date, node.end_date, r.start_date, r.end_date)) continue;
          overlapping.push({
            node_id: r.id,
            node_type: typ,
            title: r.title,
            start_date: r.start_date,
            end_date: r.end_date ?? null
          });
        }
      }

      results.push({ node, overlappingNodes: overlapping });
    }

    return results;
  }
}

export const threadTimelineService = new ThreadTimelineService();

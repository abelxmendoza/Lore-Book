/**
 * ThreadMembershipService - Links threads to saga/arc nodes.
 * Validates node_id exists in timeline_sagas or timeline_arcs before insert.
 */

import { supabaseAdmin } from '../supabaseClient';
import { LAYER_TABLE_MAP } from '../../types/timeline';
import type { Thread, ThreadNodeType, ThreadRole } from '../../types/threads';
import type { ThreadNodeSnapshot } from '../../types/threads';
import { threadService } from './threadService';

const NODE_TABLE: Record<ThreadNodeType, string> = {
  saga: LAYER_TABLE_MAP.saga,
  arc: LAYER_TABLE_MAP.arc
};

export class ThreadMembershipService {
  private async nodeExists(userId: string, nodeId: string, nodeType: ThreadNodeType): Promise<boolean> {
    const table = NODE_TABLE[nodeType];
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();
    return !error && !!data;
  }

  async addMembership(
    userId: string,
    threadId: string,
    nodeId: string,
    nodeType: ThreadNodeType,
    role?: ThreadRole
  ): Promise<{ id: string; thread_id: string; node_id: string; node_type: ThreadNodeType; role: ThreadRole | null }> {
    const exists = await this.nodeExists(userId, nodeId, nodeType);
    if (!exists) {
      throw new Error(`Node ${nodeId} (${nodeType}) not found or not owned by user`);
    }

    const thread = await threadService.getById(userId, threadId);
    if (!thread) throw new Error('Thread not found');

    const { data, error } = await supabaseAdmin
      .from('thread_memberships')
      .upsert(
        {
          thread_id: threadId,
          node_id: nodeId,
          node_type: nodeType,
          role: role ?? null
        },
        { onConflict: 'thread_id,node_id,node_type' }
      )
      .select('id, thread_id, node_id, node_type, role')
      .single();

    if (error) throw error;
    return data as { id: string; thread_id: string; node_id: string; node_type: ThreadNodeType; role: ThreadRole | null };
  }

  async removeMembership(userId: string, threadId: string, nodeId: string, nodeType: ThreadNodeType): Promise<void> {
    const thread = await threadService.getById(userId, threadId);
    if (!thread) throw new Error('Thread not found');

    const { error } = await supabaseAdmin
      .from('thread_memberships')
      .delete()
      .eq('thread_id', threadId)
      .eq('node_id', nodeId)
      .eq('node_type', nodeType);

    if (error) throw error;
  }

  /** Threads for a node (id, name, category, role, membership_id for remove). */
  async getMembershipsForNode(
    userId: string,
    nodeId: string,
    nodeType: ThreadNodeType
  ): Promise<Array<{ id: string; name: string; category: string | null; role: string | null; membership_id: string }>> {
    const { data: memberships, error: me } = await supabaseAdmin
      .from('thread_memberships')
      .select('id, thread_id, role')
      .eq('node_id', nodeId)
      .eq('node_type', nodeType);

    if (me || !memberships?.length) return [];

    const out: Array<{ id: string; name: string; category: string | null; role: string | null; membership_id: string }> = [];
    for (const m of memberships as { id: string; thread_id: string; role: ThreadRole | null }[]) {
      const t = await threadService.getById(userId, m.thread_id);
      if (t) out.push({ id: t.id, name: t.name, category: t.category, role: m.role, membership_id: m.id });
    }
    return out;
  }

  async getThreadsForNode(userId: string, nodeId: string, nodeType: ThreadNodeType): Promise<Thread[]> {
    const { data: memberships } = await supabaseAdmin
      .from('thread_memberships')
      .select('thread_id')
      .eq('node_id', nodeId)
      .eq('node_type', nodeType);
    if (!memberships?.length) return [];
    const threadIds = [...new Set(memberships.map((m: { thread_id: string }) => m.thread_id))];
    const threads: Thread[] = [];
    for (const tid of threadIds) {
      const t = await threadService.getById(userId, tid);
      if (t) threads.push(t);
    }
    return threads;
  }

  async removeMembershipById(userId: string, membershipId: string, expectedThreadId?: string): Promise<void> {
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('thread_memberships')
      .select('thread_id')
      .eq('id', membershipId)
      .single();

    if (fetchErr || !row) throw new Error('Membership not found');
    const threadId = (row as { thread_id: string }).thread_id;
    if (expectedThreadId && threadId !== expectedThreadId) throw new Error('Membership does not belong to this thread');
    const thread = await threadService.getById(userId, threadId);
    if (!thread) throw new Error('Thread not found');

    const { error } = await supabaseAdmin.from('thread_memberships').delete().eq('id', membershipId);
    if (error) throw error;
  }

  async getNodesForThread(userId: string, threadId: string): Promise<ThreadNodeSnapshot[]> {
    const thread = await threadService.getById(userId, threadId);
    if (!thread) return [];

    const { data: memberships, error } = await supabaseAdmin
      .from('thread_memberships')
      .select('node_id, node_type, role')
      .eq('thread_id', threadId);

    if (error || !memberships?.length) return [];

    const results: ThreadNodeSnapshot[] = [];
    for (const m of memberships as { node_id: string; node_type: ThreadNodeType; role: ThreadRole | null }[]) {
      const table = NODE_TABLE[m.node_type];
      const { data: row } = await supabaseAdmin
        .from(table)
        .select('id, title, description, start_date, end_date, created_at, updated_at')
        .eq('id', m.node_id)
        .eq('user_id', userId)
        .single();

      if (row) {
        results.push({
          node_id: row.id,
          node_type: m.node_type,
          thread_id: threadId,
          role: m.role,
          title: row.title,
          description: row.description ?? null,
          start_date: row.start_date,
          end_date: row.end_date ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }
    }
    return results;
  }
}

export const threadMembershipService = new ThreadMembershipService();

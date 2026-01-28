/**
 * NodeRelationService - Causality between timeline nodes (paused_by, parallel_to, etc.)
 * Validates both from and to nodes exist before insert.
 */

import { supabaseAdmin } from '../supabaseClient';
import { LAYER_TABLE_MAP } from '../../types/timeline';
import type { TimelineNodeRelation, ThreadNodeType, NodeRelationType } from '../../types/threads';

const NODE_TABLE: Record<ThreadNodeType, string> = {
  saga: LAYER_TABLE_MAP.saga,
  arc: LAYER_TABLE_MAP.arc
};

export class NodeRelationService {
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

  async create(
    userId: string,
    from: { nodeId: string; nodeType: ThreadNodeType },
    to: { nodeId: string; nodeType: ThreadNodeType },
    relationType: NodeRelationType,
    description?: string
  ): Promise<TimelineNodeRelation> {
    const fromOk = await this.nodeExists(userId, from.nodeId, from.nodeType);
    const toOk = await this.nodeExists(userId, to.nodeId, to.nodeType);
    if (!fromOk) throw new Error(`From node ${from.nodeId} (${from.nodeType}) not found`);
    if (!toOk) throw new Error(`To node ${to.nodeId} (${to.nodeType}) not found`);

    const { data, error } = await supabaseAdmin
      .from('timeline_node_relations')
      .insert({
        user_id: userId,
        from_node_id: from.nodeId,
        from_node_type: from.nodeType,
        to_node_id: to.nodeId,
        to_node_type: to.nodeType,
        relation_type: relationType,
        description: description ?? null
      })
      .select()
      .single();

    if (error) throw error;
    return data as TimelineNodeRelation;
  }

  async listByNode(
    userId: string,
    nodeId: string,
    nodeType: ThreadNodeType
  ): Promise<{ incoming: TimelineNodeRelation[]; outgoing: TimelineNodeRelation[] }> {
    const [out, in_] = await Promise.all([
      supabaseAdmin
        .from('timeline_node_relations')
        .select('*')
        .eq('user_id', userId)
        .eq('from_node_id', nodeId)
        .eq('from_node_type', nodeType),
      supabaseAdmin
        .from('timeline_node_relations')
        .select('*')
        .eq('user_id', userId)
        .eq('to_node_id', nodeId)
        .eq('to_node_type', nodeType)
    ]);

    return {
      outgoing: (out.data ?? []) as TimelineNodeRelation[],
      incoming: (in_.data ?? []) as TimelineNodeRelation[]
    };
  }

  async listByUser(userId: string): Promise<TimelineNodeRelation[]> {
    const { data, error } = await supabaseAdmin
      .from('timeline_node_relations')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? []) as TimelineNodeRelation[];
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('timeline_node_relations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

export const nodeRelationService = new NodeRelationService();

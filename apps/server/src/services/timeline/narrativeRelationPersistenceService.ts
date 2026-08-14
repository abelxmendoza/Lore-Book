import { normalizeNameKey } from '../../utils/nameNormalization';
import { upsertGraphEdge } from '../cognition/graphEdgeRepository';
import { upsertGraphNodeByMachineKey } from '../cognition/graphNodeRepository';
import type { GraphNodeKind, RelationKind } from '../cognition/relationshipRegistry';
import { supabaseAdmin } from '../supabaseClient';
import { mergeRelationProvenance } from './relationProvenance';
import type { AttachedToType, TimelineNarrativeRelation } from './timelineStitchingTypes';

function graphNodeKind(type: AttachedToType): GraphNodeKind {
  switch (type) {
    case 'event': return 'event';
    case 'relationship':
    case 'relationship_arc': return 'relationship';
    case 'skill': return 'skill';
    case 'project': return 'artifact';
    case 'place_visit': return 'place';
    default: return 'concept';
  }
}

async function ensureNarrativeNode(userId: string, target: TimelineNarrativeRelation['source']) {
  const nodeKind = graphNodeKind(target.attachedToType);
  return upsertGraphNodeByMachineKey(userId, {
    nodeKind,
    rootType: target.attachedToType.toUpperCase(),
    displayName: target.attachedToLabel,
    machineKey: `narrative:${target.attachedToType}:${normalizeNameKey(target.attachedToLabel)}`,
    confidence: target.confidence,
    epistemicState: 'POSSIBLE',
    extractionMethod: 'cross_thread_narrative_milestone',
    meta: {
      attached_to_type: target.attachedToType,
      attached_to_id: target.attachedToId ?? null,
    },
  });
}

export async function persistNarrativeRelations(
  userId: string,
  relations: TimelineNarrativeRelation[],
): Promise<{ written: number; reused: number; sourceThreadsSeen: number }> {
  let written = 0;
  let reused = 0;
  const sourceThreads = new Set<string>();

  for (const relation of relations) {
    const [sourceNode, targetNode] = await Promise.all([
      ensureNarrativeNode(userId, relation.source),
      ensureNarrativeNode(userId, relation.target),
    ]);
    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) continue;

    const { data: existing } = await supabaseAdmin
      .from('graph_edges')
      .select('id, meta')
      .eq('user_id', userId)
      .eq('from_node_id', sourceNode.id)
      .eq('to_node_id', targetNode.id)
      .eq('relation_kind', relation.relation)
      .is('valid_to', null)
      .maybeSingle();
    const priorMeta = (existing?.meta ?? {}) as Record<string, unknown>;
    const merged = mergeRelationProvenance(
      {
        source_message_id: priorMeta.source_message_id,
        source_message_ids: priorMeta.source_message_ids,
        source_thread_ids: priorMeta.source_thread_ids,
        source_assertion_ids: priorMeta.source_assertion_ids,
        evidence_phrase: priorMeta.evidence_phrase,
      },
      {
        sourceMessageIds: relation.sourceMessageIds,
        sourceThreadIds: relation.sourceThreadIds,
        sourceAssertionIds: relation.sourceAssertionIds,
        evidencePhrase: relation.evidencePhrase,
      },
    );
    merged.sourceThreadIds.forEach((threadId) => sourceThreads.add(threadId));

    const edge = await upsertGraphEdge(userId, {
      fromNodeId: sourceNode.id,
      toNodeId: targetNode.id,
      relationKind: relation.relation as RelationKind,
      fromNodeKind: sourceNode.node_kind,
      toNodeKind: targetNode.node_kind,
      confidence: relation.confidence,
      epistemicState: relation.inferredNotConfirmed ? 'POSSIBLE' : 'LIKELY',
      extractionMethod: 'cross_thread_narrative_milestone',
      meta: {
        ...priorMeta,
        canonical_relation_id: relation.id,
        evidence_phrase: merged.evidencePhrase,
        source_message_id: relation.sourceMessageId,
        source_message_ids: merged.sourceMessageIds,
        source_thread_ids: merged.sourceThreadIds,
        source_assertion_ids: merged.sourceAssertionIds,
        conversation_time: relation.conversationTime ?? null,
        knowledge_time: relation.knowledgeTime,
        narrative_semantics: true,
      },
    });
    if (!edge) continue;
    written += 1;
    if (existing?.id) reused += 1;
  }

  return { written, reused, sourceThreadsSeen: sourceThreads.size };
}

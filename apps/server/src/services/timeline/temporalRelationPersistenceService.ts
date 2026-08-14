import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { TimelineTemporalRelation } from './timelineStitchingTypes';
import { mergeRelationProvenance } from './relationProvenance';

export async function persistTemporalRelations(
  userId: string,
  relations: TimelineTemporalRelation[],
): Promise<{ written: number; reused: number; sourceThreadsSeen: number }> {
  if (relations.length === 0) return { written: 0, reused: 0, sourceThreadsSeen: 0 };
  const ids = relations.map((relation) => relation.id);
  const { data: existing } = await supabaseAdmin
    .from('canonical_temporal_relations')
    .select('id, source_message_id, source_message_ids, source_thread_ids, source_assertion_ids, evidence_phrase')
    .eq('user_id', userId)
    .in('id', ids);
  const existingById = new Map((existing ?? []).map((row) => [row.id as string, row]));
  const rows = relations.map((relation) => ({
    ...(() => {
      const prior = existingById.get(relation.id);
      const merged = mergeRelationProvenance(prior, {
        sourceMessageIds: relation.sourceMessageIds,
        sourceThreadIds: relation.sourceThreadIds,
        sourceAssertionIds: relation.sourceAssertionIds,
        evidencePhrase: relation.evidencePhrase,
      });
      return {
        source_message_ids: merged.sourceMessageIds,
        source_thread_ids: merged.sourceThreadIds,
        source_assertion_ids: merged.sourceAssertionIds,
        evidence_phrase: merged.evidencePhrase,
      };
    })(),
    id: relation.id,
    user_id: userId,
    source_ref_type: relation.source.attachedToType,
    source_ref_id: relation.source.attachedToId ?? null,
    source_label: relation.source.attachedToLabel,
    target_ref_type: relation.target.attachedToType,
    target_ref_id: relation.target.attachedToId ?? null,
    target_label: relation.target.attachedToLabel,
    relation_type: relation.relation,
    confidence: relation.confidence,
    source_message_id: relation.sourceMessageId,
    conversation_time: relation.conversationTime ?? null,
    knowledge_time: relation.knowledgeTime,
    inferred_not_confirmed: relation.inferredNotConfirmed,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('canonical_temporal_relations')
    .upsert(rows, { onConflict: 'id' });
  if (error) {
    // The app must keep working before the additive migration reaches every environment.
    logger.warn({ error, userId, count: rows.length }, 'Temporal relation persistence unavailable');
    return { written: 0, reused: 0, sourceThreadsSeen: 0 };
  }
  return {
    written: rows.length,
    reused: relations.filter((relation) => existingById.has(relation.id)).length,
    sourceThreadsSeen: new Set(rows.flatMap((row) => row.source_thread_ids)).size,
  };
}

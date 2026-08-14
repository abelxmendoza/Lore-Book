import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { TimelineTemporalRelation } from './timelineStitchingTypes';

export async function persistTemporalRelations(
  userId: string,
  relations: TimelineTemporalRelation[],
): Promise<number> {
  if (relations.length === 0) return 0;
  const rows = relations.map((relation) => ({
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
    evidence_phrase: relation.evidencePhrase,
    source_message_id: relation.sourceMessageId,
    source_assertion_ids: relation.sourceAssertionIds,
    inferred_not_confirmed: relation.inferredNotConfirmed,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('canonical_temporal_relations')
    .upsert(rows, { onConflict: 'id' });
  if (error) {
    // The app must keep working before the additive migration reaches every environment.
    logger.warn({ error, userId, count: rows.length }, 'Temporal relation persistence unavailable');
    return 0;
  }
  return rows.length;
}

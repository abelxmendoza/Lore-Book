import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { epistemicStateFromConfidence } from './epistemicState';
import { writeAssertionEvidence } from './assertionEvidenceRepository';
import { upsertGraphNodeBySource } from './graphNodeRepository';

export async function bridgeCharacterToGraphNode(
  userId: string,
  characterId: string,
): Promise<void> {
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id, name, importance_score, metadata')
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();

  if (!character) return;

  const confidence = Number(character.importance_score ?? 0.5);
  const node = await upsertGraphNodeBySource(userId, {
    nodeKind: 'person',
    rootType: 'PERSON',
    displayName: character.name,
    machineKey: `person:${characterId}`,
    confidence: Math.min(0.99, Math.max(0.05, confidence)),
    epistemicState: epistemicStateFromConfidence(confidence),
    sourceTable: 'characters',
    sourceId: characterId,
    extractionMethod: 'character_registry',
    meta: { importance: character.metadata },
  });

  if (node) {
    await writeAssertionEvidence(userId, [{
      targetKind: 'node',
      targetId: node.id,
      evidenceKind: 'characters',
      evidenceId: characterId,
      weight: confidence,
    }]);
  }
}

export async function bridgeResolvedEventToGraphNode(
  userId: string,
  eventId: string,
): Promise<void> {
  const { data: event } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, start_time, end_time, confidence, metadata, type')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();

  if (!event) return;

  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  const significance = typeof meta.significance === 'number' ? meta.significance : event.confidence;

  await upsertGraphNodeBySource(userId, {
    nodeKind: 'event',
    rootType: 'EVENT',
    displayName: event.title,
    machineKey: `event:${eventId}`,
    confidence: event.confidence ?? 0.7,
    epistemicState: epistemicStateFromConfidence(significance ?? 0.7),
    validFrom: event.start_time,
    validTo: event.end_time,
    sourceTable: 'resolved_events',
    sourceId: eventId,
    extractionMethod: 'resolved_events',
    meta: {
      summary: event.summary,
      life_event_category: meta.life_event_category,
      significance,
    },
  });
}

export function ingestGraphNodeForEvent(userId: string, eventId: string): void {
  void bridgeResolvedEventToGraphNode(userId, eventId).catch((err) => {
    logger.warn({ err, userId, eventId }, 'graphBridge: event node failed');
  });
}

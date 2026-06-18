/**
 * Queue extracted semantic units through MRQ (Step 11).
 * Never writes omega claims directly — all candidates go through memoryReviewQueueService.
 */
import { logger } from '../../logger';
import type { ExtractedUnit, ExtractedUnitType } from '../../types/conversationCentered';
import type { Entity } from '../../types/omegaMemory';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perspectiveService } from '../perspectiveService';
import { supabaseAdmin } from '../supabaseClient';

const MRQ_UNIT_TYPES = new Set<ExtractedUnitType>([
  'CLAIM',
  'PERCEPTION',
  'DECISION',
  'CORRECTION',
]);

const MRQ_CONFIDENCE_FLOOR = 0.45;

export function shouldQueueExtractedUnitForReview(unit: Pick<ExtractedUnit, 'type' | 'confidence'>): boolean {
  if (!MRQ_UNIT_TYPES.has(unit.type)) return false;
  return unit.confidence >= MRQ_CONFIDENCE_FLOOR;
}

async function resolveTargetEntity(userId: string, entityIds: string[]): Promise<Entity | null> {
  for (const id of entityIds) {
    const { data, error } = await supabaseAdmin
      .from('omega_entities')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.warn({ err: error, userId, entityId: id }, 'Ingestion MRQ: entity lookup failed');
      continue;
    }
    if (data) return data as Entity;
  }

  const entities = await omegaMemoryService.getEntities(userId);
  return entities[0] ?? null;
}

export async function queueExtractedUnitForReview(
  userId: string,
  unit: ExtractedUnit,
  sourceText?: string
): Promise<{ queued: boolean; autoApproved?: boolean; proposalId?: string; reason?: string }> {
  if (!shouldQueueExtractedUnitForReview(unit)) {
    return { queued: false, reason: 'unit_not_reviewable' };
  }

  let targetEntity: Entity | null = null;
  let selfPerspectiveId: string | null = null;

  try {
    targetEntity = await resolveTargetEntity(userId, unit.entity_ids ?? []);
    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
    selfPerspectiveId = perspectives.find((p) => p.type === 'SELF')?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId, unitId: unit.id }, 'Ingestion MRQ: could not resolve entity or perspective');
    return { queued: false, reason: 'resolution_failed' };
  }

  if (!targetEntity) {
    return { queued: false, reason: 'no_target_entity' };
  }

  try {
    const excerpt = sourceText ?? unit.content;
    const { proposal, auto_approved } = await memoryReviewQueueService.ingestMemory(
      userId,
      {
        id: '',
        text: unit.content,
        confidence: unit.confidence,
        metadata: {
          extracted_unit_id: unit.id,
          extracted_unit_type: unit.type,
          utterance_id: unit.utterance_id,
          temporal_context: unit.temporal_context,
          source: 'ingestion_pipeline',
        },
      },
      targetEntity,
      selfPerspectiveId,
      excerpt
    );

    logger.info(
      {
        userId,
        unitId: unit.id,
        unitType: unit.type,
        proposalId: proposal.id,
        autoApproved: auto_approved,
        entityId: targetEntity.id,
      },
      'Extracted unit queued for memory review'
    );

    return { queued: true, autoApproved: auto_approved, proposalId: proposal.id };
  } catch (err) {
    logger.warn({ err, userId, unitId: unit.id }, 'Ingestion MRQ: ingestMemory failed');
    return { queued: false, reason: 'ingest_failed' };
  }
}

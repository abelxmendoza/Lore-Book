/**
 * Queue memory review candidates from meaning resolution (never hard writes).
 */
import { logger } from '../../logger';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perspectiveService } from '../perspectiveService';
import type { MeaningResolutionResult } from './meaningResolutionTypes';

export async function processMeaningMemoryCandidates(
  userId: string,
  messageId: string,
  result: MeaningResolutionResult
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  let skipped = 0;

  if (!result.memoryReviewCandidates.length) return { queued, skipped };

  let selfEntity: Awaited<ReturnType<typeof omegaMemoryService.getEntities>>[number] | null = null;
  let selfPerspectiveId: string | null = null;

  try {
    const entities = await omegaMemoryService.getEntities(userId);
    selfEntity = entities[0] ?? null;
    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
    selfPerspectiveId = perspectives.find((p) => p.type === 'SELF')?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, 'Meaning memory bridge: could not resolve self entity');
    return { queued: 0, skipped: result.memoryReviewCandidates.length };
  }

  if (!selfEntity) {
    return { queued: 0, skipped: result.memoryReviewCandidates.length };
  }

  for (const candidate of result.memoryReviewCandidates) {
    try {
      if (candidate.confidence < 0.45) {
        skipped++;
        continue;
      }
      await memoryReviewQueueService.ingestMemory(
        userId,
        {
          id: '',
          text: candidate.claim,
          confidence: candidate.confidence,
          metadata: {
            category: candidate.category,
            source: candidate.source,
            requires_confirmation: candidate.requiresConfirmation,
            message_id: messageId,
            from: 'meaning_resolution',
          },
        },
        selfEntity,
        selfPerspectiveId,
        result.rawText ?? candidate.claim
      );
      queued++;
    } catch (err) {
      logger.warn({ err, claim: candidate.claim }, 'Meaning memory candidate queue failed');
      skipped++;
    }
  }

  return { queued, skipped };
}

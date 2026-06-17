/**
 * Bridge lexical memory candidates into the cognition/review pipeline.
 * Never writes permanent memory directly — all candidates go through MRQ.
 */
import { logger } from '../../logger';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perspectiveService } from '../perspectiveService';
import type { LexicalAnalysisResult, MemoryCandidate } from './lexicalTypes';

export async function processLexicalMemoryCandidates(
  userId: string,
  messageId: string,
  analysis: LexicalAnalysisResult
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  let skipped = 0;

  if (!analysis.memoryCandidates.length) {
    return { queued, skipped };
  }

  let selfEntity: Awaited<ReturnType<typeof omegaMemoryService.getEntities>>[number] | null = null;
  let selfPerspectiveId: string | null = null;

  try {
    const entities = await omegaMemoryService.getEntities(userId);
    selfEntity = entities[0] ?? null;
    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
    selfPerspectiveId = perspectives.find((p) => p.type === 'SELF')?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, 'Lexical memory bridge: could not resolve self entity');
    return { queued: 0, skipped: analysis.memoryCandidates.length };
  }

  if (!selfEntity) {
    return { queued: 0, skipped: analysis.memoryCandidates.length };
  }

  for (const candidate of analysis.memoryCandidates) {
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
            lexical_source: candidate.source,
            requires_confirmation: candidate.requiresConfirmation,
            message_id: messageId,
          },
        },
        selfEntity,
        selfPerspectiveId,
        analysis.rawText
      );
      queued++;
    } catch (err) {
      logger.warn({ err, userId, messageId, claim: candidate.claim }, 'Lexical memory candidate queue failed');
      skipped++;
    }
  }

  return { queued, skipped };
}

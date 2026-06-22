import { logger } from '../../logger';
import { mediaInferenceService } from './inference/mediaInferenceService';

export type MediaInferenceRunSummary = {
  candidatesAccepted: number;
  rejected: number;
};

export async function runMediaInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorMentionCounts: Record<string, number> = {},
  knownCharacters?: Record<string, string>,
): Promise<MediaInferenceRunSummary> {
  if (!text.trim() || text.trim().length < 8) {
    return { candidatesAccepted: 0, rejected: 0 };
  }

  try {
    const result = mediaInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorMentionCounts,
      knownCharacters,
    });

    if (result.accepted.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          candidatesAccepted: result.accepted.length,
          rejected: result.rejected.length,
        },
        'Media inference applied',
      );
    }

    return {
      candidatesAccepted: result.accepted.length,
      rejected: result.rejected.length,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Media inference failed (non-blocking)');
    return { candidatesAccepted: 0, rejected: 0 };
  }
}

export async function rescanMediaInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
  knownCharacters?: Record<string, string>,
): Promise<MediaInferenceRunSummary> {
  let candidatesAccepted = 0;
  let rejected = 0;
  const mentionCounts = new Map<string, number>();

  for (const episode of episodes) {
    const result = mediaInferenceService.inferFromMessage({
      text: episode.text,
      sourceMessageId: episode.id,
      authorRole: 'user',
      priorMentionCounts: Object.fromEntries(mentionCounts),
      knownCharacters,
    });

    for (const candidate of result.accepted) {
      const key = candidate.displayName.toLowerCase();
      mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
    }

    candidatesAccepted += result.accepted.length;
    rejected += result.rejected.length;
  }

  return { candidatesAccepted, rejected };
}

import { logger } from '../../logger';
import { preferenceInferenceService } from './inference/preferenceInferenceService';

export type PreferenceInferenceRunSummary = {
  signalsAccepted: number;
  rejected: number;
};

export async function runPreferenceInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorMentionCounts: Record<string, number> = {},
): Promise<PreferenceInferenceRunSummary> {
  if (!text.trim() || text.trim().length < 8) {
    return { signalsAccepted: 0, rejected: 0 };
  }

  try {
    const result = preferenceInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorMentionCounts,
      seenAt: new Date().toISOString(),
    });

    if (result.accepted.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          signalsAccepted: result.accepted.length,
          rejected: result.rejected.length,
        },
        'Preference inference applied',
      );
    }

    return {
      signalsAccepted: result.accepted.length,
      rejected: result.rejected.length,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Preference inference failed (non-blocking)');
    return { signalsAccepted: 0, rejected: 0 };
  }
}

export async function rescanPreferenceInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
): Promise<PreferenceInferenceRunSummary> {
  let signalsAccepted = 0;
  let rejected = 0;
  const mentionCounts = new Map<string, number>();

  for (const episode of episodes) {
    const result = preferenceInferenceService.inferFromMessage({
      text: episode.text,
      sourceMessageId: episode.id,
      authorRole: 'user',
      priorMentionCounts: Object.fromEntries(mentionCounts),
      seenAt: new Date().toISOString(),
    });

    for (const signal of result.accepted) {
      const key = signal.displayName.toLowerCase();
      mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
    }

    signalsAccepted += result.accepted.length;
    rejected += result.rejected.length;
  }

  return { signalsAccepted, rejected };
}

import { logger } from '../../logger';
import { emotionInferenceService } from './inference/emotionInferenceService';
import type { EmotionalArcState } from './inference/emotionalArcInferenceService';

export type EmotionInferenceRunSummary = {
  signalsAccepted: number;
  significanceDetected: number;
  rejected: number;
};

export async function runEmotionInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorArcPhases: EmotionalArcState = {},
): Promise<EmotionInferenceRunSummary & { arcState: EmotionalArcState }> {
  if (!text.trim() || text.trim().length < 8) {
    return { signalsAccepted: 0, significanceDetected: 0, rejected: 0, arcState: priorArcPhases };
  }

  try {
    const result = emotionInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorArcPhases,
    });

    if (result.accepted.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          signalsAccepted: result.accepted.length,
          significanceDetected: result.significance.length,
          rejected: result.rejected.length,
        },
        'Emotion inference applied',
      );
    }

    return {
      signalsAccepted: result.accepted.length,
      significanceDetected: result.significance.length,
      rejected: result.rejected.length,
      arcState: result.arcState,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Emotion inference failed (non-blocking)');
    return { signalsAccepted: 0, significanceDetected: 0, rejected: 0, arcState: priorArcPhases };
  }
}

export async function rescanEmotionInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
): Promise<EmotionInferenceRunSummary> {
  let signalsAccepted = 0;
  let significanceDetected = 0;
  let rejected = 0;
  let arcState: EmotionalArcState = {};

  for (const episode of episodes) {
    const result = await runEmotionInferenceForMessage(
      userId,
      episode.text,
      episode.id,
      arcState,
    );
    signalsAccepted += result.signalsAccepted;
    significanceDetected += result.significanceDetected;
    rejected += result.rejected;
    arcState = result.arcState;
  }

  return { signalsAccepted, significanceDetected, rejected };
}

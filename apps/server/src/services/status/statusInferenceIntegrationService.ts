import { logger } from '../../logger';
import { statusInferenceService } from './inference/statusInferenceService';
import type { LifecycleEntry } from './inference/statusInferenceTypes';

export type StatusInferenceRunSummary = {
  signalsAccepted: number;
  transitionsRecorded: number;
  rejected: number;
};

export async function runStatusInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorLifecycle: Record<string, LifecycleEntry[]> = {},
): Promise<StatusInferenceRunSummary & { lifecycleState: Record<string, LifecycleEntry[]> }> {
  if (!text.trim() || text.trim().length < 8) {
    return { signalsAccepted: 0, transitionsRecorded: 0, rejected: 0, lifecycleState: priorLifecycle };
  }

  try {
    const result = statusInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorLifecycle,
      seenAt: new Date().toISOString(),
    });

    if (result.accepted.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          signalsAccepted: result.accepted.length,
          transitionsRecorded: result.lifecycle.length,
          rejected: result.rejected.length,
        },
        'Status inference applied',
      );
    }

    return {
      signalsAccepted: result.accepted.length,
      transitionsRecorded: result.lifecycle.length,
      rejected: result.rejected.length,
      lifecycleState: result.lifecycleState,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Status inference failed (non-blocking)');
    return { signalsAccepted: 0, transitionsRecorded: 0, rejected: 0, lifecycleState: priorLifecycle };
  }
}

export async function rescanStatusInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
): Promise<StatusInferenceRunSummary> {
  let signalsAccepted = 0;
  let transitionsRecorded = 0;
  let rejected = 0;
  let lifecycleState: Record<string, LifecycleEntry[]> = {};

  for (const episode of episodes) {
    const result = await runStatusInferenceForMessage(
      userId,
      episode.text,
      episode.id,
      lifecycleState,
    );
    signalsAccepted += result.signalsAccepted;
    transitionsRecorded += result.transitionsRecorded;
    rejected += result.rejected;
    lifecycleState = result.lifecycleState;
  }

  return { signalsAccepted, transitionsRecorded, rejected };
}

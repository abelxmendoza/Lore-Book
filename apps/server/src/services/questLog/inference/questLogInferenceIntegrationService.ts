import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { questLogSuggestionService } from '../questLogSuggestionService';
import { questLogInferenceService } from './inference/questLogInferenceService';
import type { QuestLogCandidate } from './inference/questLogInferenceTypes';

export type QuestLogInferenceRunSummary = {
  candidatesAccepted: number;
  suggestionsUpserted: number;
  rejected: number;
};

export async function runQuestLogInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorMentionCounts: Record<string, number> = {},
  knownProjects?: Record<string, string>,
): Promise<QuestLogInferenceRunSummary> {
  if (!text.trim() || text.trim().length < 8) {
    return { candidatesAccepted: 0, suggestionsUpserted: 0, rejected: 0 };
  }

  try {
    const result = questLogInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorMentionCounts,
      knownProjects,
    });

    let suggestionsUpserted = 0;
    for (const candidate of result.accepted) {
      if (!questLogInferenceService.shouldRouteToQuestLogUi(candidate)) continue;
      const upserted = await questLogSuggestionService.upsertFromInference(userId, candidate, {
        sourceMessageId,
        source: 'chat',
      });
      if (upserted) suggestionsUpserted += 1;
    }

    if (result.accepted.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          candidatesAccepted: result.accepted.length,
          suggestionsUpserted,
          rejected: result.rejected.length,
        },
        'Quest Log inference applied',
      );
    }

    return {
      candidatesAccepted: result.accepted.length,
      suggestionsUpserted,
      rejected: result.rejected.length,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Quest Log inference failed (non-blocking)');
    return { candidatesAccepted: 0, suggestionsUpserted: 0, rejected: 0 };
  }
}

export async function rescanQuestLogInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
  knownProjects?: Record<string, string>,
): Promise<QuestLogInferenceRunSummary> {
  let candidatesAccepted = 0;
  let suggestionsUpserted = 0;
  let rejected = 0;
  const mentionCounts = new Map<string, number>();

  for (const episode of episodes) {
    const inference = questLogInferenceService.inferFromMessage({
      text: episode.text,
      sourceMessageId: episode.id,
      authorRole: 'user',
      priorMentionCounts: Object.fromEntries(mentionCounts),
      knownProjects,
    });

    for (const candidate of inference.accepted) {
      const key = normalizeNameKey(candidate.displayName);
      mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
      const promoted = finalizeForRescan(candidate, mentionCounts.get(key) ?? 1);
      if (!questLogInferenceService.shouldRouteToQuestLogUi(promoted)) continue;
      const upserted = await questLogSuggestionService.upsertFromInference(userId, promoted, {
        sourceMessageId: episode.id,
        source: 'llm_scan',
      });
      if (upserted) suggestionsUpserted += 1;
    }

    candidatesAccepted += inference.accepted.length;
    rejected += inference.rejected.length;
  }

  return { candidatesAccepted, suggestionsUpserted, rejected };
}

function finalizeForRescan(candidate: QuestLogCandidate, mentionCount: number): QuestLogCandidate {
  const promotable = questLogInferenceService.canPromote(candidate, {
    mentionCount,
    priorMentions: mentionCount - 1,
  });
  return {
    ...candidate,
    promotionStatus: promotable ? 'suggested_quest_log_item' : candidate.promotionStatus,
    confidence: Math.min(0.98, candidate.confidence + Math.min(0.15, (mentionCount - 1) * 0.04)),
  };
}

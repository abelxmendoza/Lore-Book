import { logger } from '../../../logger';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { organizationSuggestionService } from '../organizationSuggestionService';
import { organizationInferenceService } from './organizationInferenceService';
import type { OrganizationCandidate } from './organizationInferenceTypes';

export type OrganizationInferenceRunSummary = {
  candidatesAccepted: number;
  suggestionsUpserted: number;
  rejected: number;
};

export async function runOrganizationInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  priorMentionCounts: Record<string, number> = {},
): Promise<OrganizationInferenceRunSummary> {
  if (!text.trim() || text.trim().length < 8) {
    return { candidatesAccepted: 0, suggestionsUpserted: 0, rejected: 0 };
  }

  try {
    const result = organizationInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      authorRole: 'user',
      priorMentionCounts,
    });

    let suggestionsUpserted = 0;
    for (const candidate of result.accepted) {
      const upserted = await organizationSuggestionService.upsertFromInference(userId, candidate, {
        sourceMessageId,
        source: 'chat',
      });
      if (upserted) suggestionsUpserted += 1;
    }

    if (result.accepted.length > 0 || suggestionsUpserted > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          candidatesAccepted: result.accepted.length,
          suggestionsUpserted,
          rejected: result.rejected.length,
        },
        'Organization inference applied',
      );
    }

    return {
      candidatesAccepted: result.accepted.length,
      suggestionsUpserted,
      rejected: result.rejected.length,
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Organization inference failed (non-blocking)');
    return { candidatesAccepted: 0, suggestionsUpserted: 0, rejected: 0 };
  }
}

export async function rescanOrganizationInference(
  userId: string,
  episodes: Array<{ id: string; text: string }>,
): Promise<OrganizationInferenceRunSummary> {
  let candidatesAccepted = 0;
  let suggestionsUpserted = 0;
  let rejected = 0;
  const mentionCounts = new Map<string, number>();

  for (const episode of episodes) {
    const inference = organizationInferenceService.inferFromMessage({
      text: episode.text,
      sourceMessageId: episode.id,
      authorRole: 'user',
      priorMentionCounts: Object.fromEntries(mentionCounts),
    });

    for (const candidate of inference.accepted) {
      const key = normalizeNameKey(candidate.displayName);
      mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);

      const promoted = finalizeForRescan(candidate, mentionCounts.get(key) ?? 1);
      const upserted = await organizationSuggestionService.upsertFromInference(userId, promoted, {
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

function finalizeForRescan(candidate: OrganizationCandidate, mentionCount: number): OrganizationCandidate {
  const promotable = organizationInferenceService.canPromote(candidate, {
    mentionCount,
    priorMentions: mentionCount - 1,
  });
  return {
    ...candidate,
    promotionStatus: promotable ? 'suggested_organization' : candidate.promotionStatus,
    confidence: Math.min(0.98, candidate.confidence + Math.min(0.15, (mentionCount - 1) * 0.04)),
  };
}

import { logger } from '../../logger';
import { truthStateGateService } from './truthStateGateService';
import type { TruthClaim, TruthStateEvaluationResult } from './truthStateTypes';

export type TruthStateRunSummary = {
  claimsAccepted: number;
  claimsRejected: number;
  chipsGenerated: number;
  reviewRequired: number;
};

function summarize(result: TruthStateEvaluationResult): TruthStateRunSummary {
  return {
    claimsAccepted: result.accepted.length,
    claimsRejected: result.rejected.length,
    chipsGenerated: result.chips.length,
    reviewRequired: result.accepted.filter((c) => c.truthState === 'review_required').length,
  };
}

export async function runTruthStateForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  opts: {
    sourceThreadId?: string;
    authorRole?: 'user' | 'assistant' | 'system';
    priorClaims?: TruthClaim[];
    rejectedKeys?: string[];
    userConfirmed?: boolean;
    userRejected?: boolean;
  } = {},
): Promise<TruthStateRunSummary & { claimHistory: TruthClaim[] }> {
  if (!text.trim() || text.trim().length < 8) {
    return {
      claimsAccepted: 0,
      claimsRejected: 0,
      chipsGenerated: 0,
      reviewRequired: 0,
      claimHistory: opts.priorClaims ?? [],
    };
  }

  try {
    const result = truthStateGateService.evaluate({
      text,
      sourceMessageId,
      sourceThreadId: opts.sourceThreadId,
      authorRole: opts.authorRole ?? 'user',
      priorClaims: opts.priorClaims,
      rejectedKeys: opts.rejectedKeys,
      userConfirmed: opts.userConfirmed,
      userRejected: opts.userRejected,
      seenAt: new Date().toISOString(),
    });

    if (result.accepted.length > 0) {
      logger.debug(
        { userId, sourceMessageId, ...summarize(result) },
        'Truth-state gate applied',
      );
    }

    return { ...summarize(result), claimHistory: result.claimHistory };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Truth-state gate failed (non-blocking)');
    return {
      claimsAccepted: 0,
      claimsRejected: 0,
      chipsGenerated: 0,
      reviewRequired: 0,
      claimHistory: opts.priorClaims ?? [],
    };
  }
}

export async function rescanTruthState(
  userId: string,
  episodes: Array<{ id: string; text: string; authorRole?: 'user' | 'assistant' | 'system' }>,
): Promise<TruthStateRunSummary> {
  let claimsAccepted = 0;
  let claimsRejected = 0;
  let chipsGenerated = 0;
  let reviewRequired = 0;
  let claimHistory: TruthClaim[] = [];
  const rejectedKeys: string[] = [];

  for (const episode of episodes) {
    const result = await runTruthStateForMessage(userId, episode.text, episode.id, {
      authorRole: episode.authorRole ?? 'user',
      priorClaims: claimHistory,
      rejectedKeys,
    });
    claimsAccepted += result.claimsAccepted;
    claimsRejected += result.claimsRejected;
    chipsGenerated += result.chipsGenerated;
    reviewRequired += result.reviewRequired;
    claimHistory = result.claimHistory;
    for (const claim of claimHistory) {
      if (claim.truthState === 'rejected' && !rejectedKeys.includes(claim.rejectionKey)) {
        rejectedKeys.push(claim.rejectionKey);
      }
    }
  }

  return { claimsAccepted, claimsRejected, chipsGenerated, reviewRequired };
}

/**
 * Single entry point for persisting omega claims through MRQ governance.
 * Callers must not write omega_claims directly — queue here and let MRQ commit.
 */
import { logger } from '../logger';
import type { Claim, Entity } from '../types/omegaMemory';
import { memoryReviewQueueService } from './memoryReviewQueueService';
import { perspectiveService } from './perspectiveService';

export type ClaimMrqResult = {
  queued: boolean;
  autoApproved: boolean;
  proposalId?: string;
  claim?: Claim;
  error?: string;
};

export type QueueClaimInput = {
  userId: string;
  claim: Partial<Claim> & { text: string; entity_id: string; confidence?: number; metadata?: Record<string, unknown> };
  entity: Entity;
  sourceText: string;
  perspectiveId?: string | null;
};

async function resolveSelfPerspectiveId(userId: string): Promise<string | null> {
  try {
    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
    return perspectives.find((p) => p.type === 'SELF')?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, 'claimGovernanceBridge: could not resolve SELF perspective');
    return null;
  }
}

/**
 * Queue a claim through MRQ. On auto-approve, the claim is persisted and returned.
 * On pending review, no omega_claim row is written until approval.
 */
export async function queueClaimThroughMrq(input: QueueClaimInput): Promise<ClaimMrqResult> {
  const { userId, claim, entity, sourceText } = input;

  if (!claim.text?.trim()) {
    return { queued: false, autoApproved: false, error: 'empty_claim_text' };
  }
  if (!entity?.id) {
    return { queued: false, autoApproved: false, error: 'missing_entity' };
  }

  const perspectiveId =
    input.perspectiveId !== undefined ? input.perspectiveId : await resolveSelfPerspectiveId(userId);

  try {
    const { proposal, auto_approved, claim: storedClaim } = await memoryReviewQueueService.ingestMemory(
      userId,
      {
        id: claim.id ?? '',
        text: claim.text,
        confidence: claim.confidence ?? 0.6,
        metadata: claim.metadata,
      },
      entity,
      perspectiveId,
      sourceText
    );

    if (!auto_approved) {
      logger.info({ proposalId: proposal.id, userId }, 'Claim queued for memory review');
    }

    return {
      queued: true,
      autoApproved: auto_approved,
      proposalId: proposal.id,
      claim: storedClaim,
    };
  } catch (err) {
    logger.warn(
      { err, userId, entityId: entity.id, claimPreview: claim.text.slice(0, 120) },
      'claimGovernanceBridge: MRQ ingest failed'
    );
    return {
      queued: false,
      autoApproved: false,
      error: err instanceof Error ? err.message : 'mrq_ingest_failed',
    };
  }
}

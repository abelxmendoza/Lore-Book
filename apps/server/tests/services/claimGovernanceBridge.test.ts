import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueClaimThroughMrq } from '../../src/services/claimGovernanceBridge';
import type { Entity } from '../../src/types/omegaMemory';

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn(),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-1', type: 'SELF' }]),
  },
}));

import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';

const entity: Entity = {
  id: 'entity-1',
  user_id: 'user-1',
  type: 'PERSON',
  primary_name: 'Me',
  aliases: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('claimGovernanceBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues claim through MRQ and returns stored claim on auto-approve', async () => {
    vi.mocked(memoryReviewQueueService.ingestMemory).mockResolvedValue({
      proposal: { id: 'proposal-1' } as any,
      auto_approved: true,
      claim: { id: 'claim-1', text: 'I work remotely' } as any,
    });

    const result = await queueClaimThroughMrq({
      userId: 'user-1',
      claim: { text: 'I work remotely', entity_id: 'entity-1', confidence: 0.8 },
      entity,
      sourceText: 'I work remotely now',
    });

    expect(result.queued).toBe(true);
    expect(result.autoApproved).toBe(true);
    expect(result.claim?.id).toBe('claim-1');
    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalled();
  });

  it('returns pending proposal without claim when review required', async () => {
    vi.mocked(memoryReviewQueueService.ingestMemory).mockResolvedValue({
      proposal: { id: 'proposal-2' } as any,
      auto_approved: false,
    });

    const result = await queueClaimThroughMrq({
      userId: 'user-1',
      claim: { text: 'My core belief changed', entity_id: 'entity-1', confidence: 0.9 },
      entity,
      sourceText: 'My core belief changed',
    });

    expect(result.queued).toBe(true);
    expect(result.autoApproved).toBe(false);
    expect(result.claim).toBeUndefined();
    expect(result.proposalId).toBe('proposal-2');
  });

  it('rejects empty claim text without calling MRQ', async () => {
    const result = await queueClaimThroughMrq({
      userId: 'user-1',
      claim: { text: '   ', entity_id: 'entity-1' },
      entity,
      sourceText: 'empty',
    });

    expect(result.queued).toBe(false);
    expect(result.error).toBe('empty_claim_text');
    expect(memoryReviewQueueService.ingestMemory).not.toHaveBeenCalled();
  });

  it('handles MRQ failures gracefully', async () => {
    vi.mocked(memoryReviewQueueService.ingestMemory).mockRejectedValue(new Error('db down'));

    const result = await queueClaimThroughMrq({
      userId: 'user-1',
      claim: { text: 'Valid claim', entity_id: 'entity-1' },
      entity,
      sourceText: 'Valid claim',
    });

    expect(result.queued).toBe(false);
    expect(result.error).toBe('db down');
  });
});

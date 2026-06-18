import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * E2E-style governance pipeline test: message → extraction unit → MRQ proposal
 * without direct omega_claim writes on pending review.
 */

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({
      proposal: { id: 'e2e-proposal-1', status: 'PENDING' },
      auto_approved: false,
    }),
  },
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([
      { id: 'self-entity', user_id: 'user-e2e', type: 'PERSON', primary_name: 'Me', aliases: [] },
    ]),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-e2e', type: 'SELF' }]),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

import { queueExtractedUnitForReview } from '../../src/services/conversationCentered/ingestionMemoryBridge';
import { queueClaimThroughMrq } from '../../src/services/claimGovernanceBridge';
import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';

describe('governance pipeline E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pending MRQ path produces proposal without persisted claim', async () => {
    const ingestionResult = await queueExtractedUnitForReview(
      'user-e2e',
      {
        id: 'unit-e2e-1',
        utterance_id: 'utt-e2e-1',
        user_id: 'user-e2e',
        type: 'PERCEPTION',
        content: 'I think my sister moved to Seattle',
        confidence: 0.82,
        temporal_context: { start_time: '2026-01-01T00:00:00.000Z' },
        entity_ids: [],
        created_at: new Date().toISOString(),
      },
      'I think my sister moved to Seattle'
    );

    expect(ingestionResult.queued).toBe(true);
    expect(ingestionResult.autoApproved).toBe(false);
    expect(ingestionResult.proposalId).toBe('e2e-proposal-1');
    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalledTimes(1);
  });

  it('split-event and omega paths share MRQ contract', async () => {
    const entities = await omegaMemoryService.getEntities('user-e2e');
    const entity = entities[0];

    const omegaResult = await queueClaimThroughMrq({
      userId: 'user-e2e',
      claim: { text: 'I decided to quit my job', entity_id: entity.id, confidence: 0.88 },
      entity,
      sourceText: 'I decided to quit my job today',
    });

    expect(omegaResult.queued).toBe(true);
    expect(omegaResult.proposalId).toBe('e2e-proposal-1');
    expect(omegaResult.claim).toBeUndefined();
  });
});

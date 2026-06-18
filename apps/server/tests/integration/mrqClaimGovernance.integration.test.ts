import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueClaimThroughMrq } from '../../src/services/claimGovernanceBridge';
import { queueExtractedUnitForReview } from '../../src/services/conversationCentered/ingestionMemoryBridge';
import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';

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

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([
      { id: 'self-entity', user_id: 'user-1', type: 'PERSON', primary_name: 'Me', aliases: [] },
    ]),
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

/**
 * Integration-style test: verifies all ingestion governance bridges call the same MRQ service.
 */
describe('MRQ claim governance integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryReviewQueueService.ingestMemory).mockResolvedValue({
      proposal: { id: 'proposal-int-1' } as any,
      auto_approved: false,
    });
  });

  it('claimGovernanceBridge and ingestionMemoryBridge both route through ingestMemory', async () => {
    await queueClaimThroughMrq({
      userId: 'user-1',
      claim: { text: 'Claim via omega path', entity_id: 'entity-1', confidence: 0.7 },
      entity: {
        id: 'entity-1',
        user_id: 'user-1',
        type: 'PERSON',
        primary_name: 'Me',
        aliases: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      sourceText: 'Claim via omega path',
    });

    await queueExtractedUnitForReview(
      'user-1',
      {
        id: 'unit-1',
        utterance_id: 'utt-1',
        user_id: 'user-1',
        type: 'CLAIM',
        content: 'Claim via ingestion path',
        confidence: 0.8,
        temporal_context: {},
        entity_ids: [],
        created_at: new Date().toISOString(),
      },
      'Claim via ingestion path'
    );

    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalledTimes(2);
  });
});

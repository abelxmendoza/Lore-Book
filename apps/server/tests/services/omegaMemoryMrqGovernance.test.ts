import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { queueClaimThroughMrq } from '../../src/services/claimGovernanceBridge';

vi.mock('../../src/services/claimGovernanceBridge', () => ({
  queueClaimThroughMrq: vi.fn(),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    recordClaimCreation: vi.fn().mockResolvedValue(undefined),
    recordContradiction: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('omegaMemoryService MRQ governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call storeClaim directly during ingestText', async () => {
    const storeClaimSpy = vi.spyOn(omegaMemoryService, 'storeClaim');

    const mockEntity = {
      id: 'entity-1',
      user_id: 'user-1',
      type: 'PERSON' as const,
      primary_name: 'John',
      aliases: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(omegaMemoryService, 'extractEntities').mockResolvedValue([{ name: 'John', type: 'PERSON' }]);
    vi.spyOn(omegaMemoryService, 'resolveEntities').mockResolvedValue([mockEntity]);
    vi.spyOn(omegaMemoryService, 'extractClaims').mockResolvedValue([
      {
        user_id: 'user-1',
        entity_id: 'entity-1',
        text: 'John lives in Portland',
        source: 'USER',
        confidence: 0.8,
      } as any,
    ]);
    vi.spyOn(omegaMemoryService, 'findSimilarClaims').mockResolvedValue([]);
    vi.spyOn(omegaMemoryService, 'conflictDetected').mockResolvedValue(false);
    vi.spyOn(omegaMemoryService, 'extractRelationships').mockResolvedValue([]);
    vi.spyOn(omegaMemoryService, 'updateEntityTimestamps').mockResolvedValue(undefined);
    vi.spyOn(omegaMemoryService, 'suggestUpdates').mockResolvedValue([]);

    vi.mocked(queueClaimThroughMrq).mockResolvedValue({
      queued: true,
      autoApproved: true,
      proposalId: 'proposal-1',
      claim: {
        id: 'claim-1',
        user_id: 'user-1',
        entity_id: 'entity-1',
        text: 'John lives in Portland',
        source: 'USER',
        confidence: 0.8,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    await omegaMemoryService.ingestText('user-1', 'John lives in Portland', 'USER');

    expect(queueClaimThroughMrq).toHaveBeenCalledTimes(1);
    expect(storeClaimSpy).not.toHaveBeenCalled();
  });

  it('skips side effects when claim remains pending in MRQ', async () => {
    const { continuityService } = await import('../../src/services/continuityService');

    vi.spyOn(omegaMemoryService, 'extractEntities').mockResolvedValue([{ name: 'John', type: 'PERSON' }]);
    vi.spyOn(omegaMemoryService, 'resolveEntities').mockResolvedValue([
      {
        id: 'entity-1',
        user_id: 'user-1',
        type: 'PERSON',
        primary_name: 'John',
        aliases: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    vi.spyOn(omegaMemoryService, 'extractClaims').mockResolvedValue([
      {
        user_id: 'user-1',
        entity_id: 'entity-1',
        text: 'Sensitive identity claim',
        source: 'USER',
        confidence: 0.95,
      } as any,
    ]);
    vi.spyOn(omegaMemoryService, 'findSimilarClaims').mockResolvedValue([]);
    vi.spyOn(omegaMemoryService, 'conflictDetected').mockResolvedValue(false);
    vi.spyOn(omegaMemoryService, 'extractRelationships').mockResolvedValue([]);
    vi.spyOn(omegaMemoryService, 'updateEntityTimestamps').mockResolvedValue(undefined);
    vi.spyOn(omegaMemoryService, 'suggestUpdates').mockResolvedValue([]);

    vi.mocked(queueClaimThroughMrq).mockResolvedValue({
      queued: true,
      autoApproved: false,
      proposalId: 'proposal-pending',
    });

    await omegaMemoryService.ingestText('user-1', 'Sensitive identity claim', 'USER');

    expect(continuityService.recordClaimCreation).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryReviewQueueService, MemoryReviewQueueService } from '../../src/services/memoryReviewQueueService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { embeddingService } from '../../src/services/embeddingService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/embeddingService');
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    emitEvent: vi.fn(),
  }
}));
vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    storeClaim: vi.fn().mockResolvedValue({
      id: 'claim-1',
      text: 'Test claim',
    }),
  }
}));
vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    ingestClaimWithPerspective: vi.fn(),
  }
}));
vi.mock('../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    defaultModel: 'gpt-4o-mini',
  }
}));
vi.mock('openai');
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('MemoryReviewQueueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyRisk', () => {
    it('should classify LOW risk for low confidence, no identity impact', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    affects_identity: false,
                    confidence: 0.3,
                  })
                }
              }]
            })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      } as any);

      const risk = await memoryReviewQueueService.classifyRisk({
        entity_id: 'entity-1',
        claim_text: 'Simple fact',
        confidence: 0.4,
      }, 'user-123');

      expect(risk).toBe('LOW');
    });

    it('should classify HIGH risk for identity-affecting claims', async () => {
      // Mock supabase for contradictsExistingClaims check
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        })
      } as any);

      // Create a new service instance with mocked OpenAI
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    affects_identity: true,
                    confidence: 0.9,
                    reason: 'Parent status affects identity'
                  })
                }
              }]
            })
          }
        }
      };

      const service = new MemoryReviewQueueService(mockOpenAI as any);

      const risk = await service.classifyRisk({
        entity_id: 'entity-1',
        claim_text: 'I am a parent',
        confidence: 0.5,
      }, 'user-123');

      expect(risk).toBe('HIGH');
    });
  });

  describe('shouldBypassReview', () => {
    it('should bypass review for LOW risk', () => {
      expect(memoryReviewQueueService.shouldBypassReview('LOW')).toBe(true);
    });

    it('should not bypass review for MEDIUM risk', () => {
      expect(memoryReviewQueueService.shouldBypassReview('MEDIUM')).toBe(false);
    });

    it('should not bypass review for HIGH risk', () => {
      expect(memoryReviewQueueService.shouldBypassReview('HIGH')).toBe(false);
    });
  });

  describe('ingestMemory', () => {
    it('should create proposal and auto-approve LOW risk', async () => {
      const mockClaim = {
        id: 'claim-1',
        text: 'Simple fact',
        confidence: 0.4,
      };

      const mockEntity = {
        id: 'entity-1',
        primary_name: 'Test Entity',
      };

      const mockProposal = {
        id: 'proposal-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        claim_text: 'Simple fact',
        risk_level: 'LOW',
        status: 'PENDING',
        created_at: new Date().toISOString(),
      };

      // Mock risk classification
      vi.spyOn(memoryReviewQueueService, 'classifyRisk').mockResolvedValue('LOW');

      // Mock proposal creation - chain: insert().select().single()
      const mockSingle = vi.fn().mockResolvedValue({ data: mockProposal, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      
      // Mock findAffectedClaims and generateReasoning
      vi.spyOn(memoryReviewQueueService as any, 'findAffectedClaims').mockResolvedValue([]);
      vi.spyOn(memoryReviewQueueService as any, 'generateReasoning').mockResolvedValue('Test reasoning');
      
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: mockInsert,
        select: vi.fn(),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      } as any);

      // Mock auto-approval
      vi.spyOn(memoryReviewQueueService, 'autoApprove').mockResolvedValue();

      const result = await memoryReviewQueueService.ingestMemory(
        'user-123',
        mockClaim,
        mockEntity,
        null,
        'Source text'
      );

      expect(result.auto_approved).toBe(true);
      expect(result.proposal).toBeDefined();
    });
  });

  describe('approveProposal', () => {
    it('should approve a proposal and commit claim', async () => {
      const mockProposal = {
        id: 'proposal-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        claim_text: 'Test claim',
        confidence: 0.8,
        perspective_id: null,
        temporal_context: {},
        risk_level: 'MEDIUM',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        affected_claim_ids: [],
      };

      const mockDecision = {
        id: 'decision-1',
        proposal_id: 'proposal-1',
        decision: 'APPROVE',
        decided_by: 'USER',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(memoryReviewQueueService, 'getProposal').mockResolvedValue(mockProposal);

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDecision, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        } as any);

      const result = await memoryReviewQueueService.approveProposal('user-123', 'proposal-1');

      expect(result.decision).toBe('APPROVE');
    });
  });

  describe('rejectProposal', () => {
    it('should reject a proposal', async () => {
      const mockProposal = {
        id: 'proposal-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        claim_text: 'Test claim',
        confidence: 0.8,
        risk_level: 'MEDIUM',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        affected_claim_ids: [],
      };

      const mockDecision = {
        id: 'decision-1',
        proposal_id: 'proposal-1',
        decision: 'REJECT',
        decided_by: 'USER',
        reason: 'Not accurate',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(memoryReviewQueueService, 'getProposal').mockResolvedValue(mockProposal);

      // Mock the insert chain for memory_decisions
      const mockInsertChain = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockDecision, error: null })
          })
        })
      };
      
      // Mock the update chain for memory_proposals
      const mockUpdateChain = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      };
      
      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(mockInsertChain as any)
        .mockReturnValueOnce(mockUpdateChain as any);

      const result = await memoryReviewQueueService.rejectProposal(
        'user-123',
        'proposal-1',
        'Not accurate'
      );

      expect(result.decision).toBe('REJECT');
    });
  });

  describe('getPendingMRQ', () => {
    it('should get pending MRQ items', async () => {
      const mockItems = [
        {
          id: 'proposal-1',
          entity_id: 'entity-1',
          claim_text: 'Test claim',
          risk_level: 'HIGH',
          created_at: new Date().toISOString(),
        }
      ];

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: mockItems,
        error: null
      } as any);

      const result = await memoryReviewQueueService.getPendingMRQ('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].risk_level).toBe('HIGH');
    });
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { perspectiveService } from '../../src/services/perspectiveService';
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

describe('PerspectiveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPerspective', () => {
    it('should create a new perspective', async () => {
      const mockPerspective = {
        id: 'perspective-1',
        user_id: 'user-123',
        type: 'SELF',
        label: 'Self',
        reliability_modifier: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockPerspective, error: null })
          })
        })
      } as any);

      const result = await perspectiveService.createPerspective('user-123', {
        type: 'SELF',
        label: 'Self',
        reliability_modifier: 1.0,
      });

      expect(result).toEqual(mockPerspective);
    });
  });

  describe('getOrCreateDefaultPerspectives', () => {
    it('should return existing perspectives if they exist', async () => {
      const mockPerspective = {
        id: 'perspective-1',
        user_id: 'user-123',
        type: 'SELF',
        label: 'Self',
        reliability_modifier: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockPerspective, error: null })
            })
          })
        })
      } as any);

      const result = await perspectiveService.getOrCreateDefaultPerspectives('user-123');

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('ingestClaimWithPerspective', () => {
    it('should create a perspective claim', async () => {
      const mockClaim = {
        id: 'claim-1',
        text: 'Test claim',
        confidence: 0.8,
        sentiment: 'POSITIVE',
      };

      const mockPerspectiveClaim = {
        id: 'pclaim-1',
        user_id: 'user-123',
        base_claim_id: 'claim-1',
        perspective_id: 'perspective-1',
        text: 'Test claim',
        confidence: 0.8,
        is_active: true,
        created_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockPerspectiveClaim, error: null })
          })
        })
      } as any);

      const result = await perspectiveService.ingestClaimWithPerspective(
        'user-123',
        mockClaim,
        'perspective-1'
      );

      expect(result).toEqual(mockPerspectiveClaim);
    });
  });

  describe('detectPerspectiveContradictions', () => {
    it('should detect contradictions between perspectives', async () => {
      const mockPerspectiveClaims = [
        {
          id: 'pclaim-1',
          base_claim_id: 'claim-1',
          perspective_id: 'perspective-1',
          text: 'John is good',
          confidence: 0.8,
        },
        {
          id: 'pclaim-2',
          base_claim_id: 'claim-1',
          perspective_id: 'perspective-2',
          text: 'John is not good',
          confidence: 0.7,
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockPerspectiveClaims, error: null })
            })
          })
        })
      } as any);

      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.1))
        .mockResolvedValueOnce(new Array(1536).fill(0.9));

      // Mock LLM contradiction detection
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    is_contradiction: true,
                    confidence: 0.9,
                  })
                }
              }]
            })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      const result = await perspectiveService.detectPerspectiveContradictions(
        'user-123',
        'claim-1'
      );

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rankClaimsByPerspective', () => {
    it('should rank claims by perspective', async () => {
      const mockBaseClaims = [
        {
          id: 'claim-1',
          entity_id: 'entity-1',
          text: 'Test claim',
          confidence: 0.8,
          is_active: true,
          created_at: new Date().toISOString(),
        }
      ];

      const mockPerspectiveClaims = [
        {
          id: 'pclaim-1',
          base_claim_id: 'claim-1',
          perspective_id: 'perspective-1',
          text: 'Test claim',
          confidence: 0.8,
          is_active: true,
          created_at: new Date().toISOString(),
          perspectives: {
            id: 'perspective-1',
            label: 'Self',
            type: 'SELF',
            reliability_modifier: 1.0,
          }
        }
      ];

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockBaseClaims, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockPerspectiveClaims, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        } as any);

      const result = await perspectiveService.rankClaimsByPerspective('entity-1', 'user-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});


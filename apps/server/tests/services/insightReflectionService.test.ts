import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insightReflectionService } from '../../src/services/insightReflectionService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { perspectiveService } from '../../src/services/perspectiveService';
import { embeddingService } from '../../src/services/embeddingService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/omegaMemoryService');
vi.mock('../../src/services/perspectiveService');
vi.mock('../../src/services/embeddingService');
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

describe('InsightReflectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectPatterns', () => {
    it('should detect recurring patterns in claims', async () => {
      const mockClaims = [
        { id: 'claim-1', text: 'Test claim', sentiment: 'POSITIVE', confidence: 0.8 },
        { id: 'claim-2', text: 'Another claim', sentiment: 'POSITIVE', confidence: 0.7 },
        { id: 'claim-3', text: 'Third claim', sentiment: 'POSITIVE', confidence: 0.9 },
      ];

      vi.mocked(omegaMemoryService.rankClaims).mockResolvedValue(mockClaims as any);

      const patterns = await insightReflectionService.detectPatterns('user-123', 'entity-1');

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('detectShifts', () => {
    it('should detect temporal shifts', async () => {
      const mockClaims = [
        { id: 'claim-1', start_time: '2024-01-01', sentiment: 'POSITIVE', confidence: 0.8 },
        { id: 'claim-2', start_time: '2024-02-01', sentiment: 'POSITIVE', confidence: 0.7 },
        { id: 'claim-3', start_time: '2024-03-01', sentiment: 'NEGATIVE', confidence: 0.6 },
        { id: 'claim-4', start_time: '2024-04-01', sentiment: 'NEGATIVE', confidence: 0.5 },
      ];

      vi.mocked(omegaMemoryService.getClaimsForEntity).mockResolvedValue(mockClaims as any);

      const shifts = await insightReflectionService.detectShifts('user-123', 'entity-1');

      expect(shifts).toBeDefined();
      expect(Array.isArray(shifts)).toBe(true);
    });
  });

  describe('detectPerspectiveDivergence', () => {
    it('should detect perspective divergence', async () => {
      const mockBaseClaims = [
        { id: 'claim-1', text: 'Test claim' },
      ];

      const mockPerspectiveClaims = [
        { id: 'pclaim-1', perspective_id: 'perspective-1', text: 'John is good' },
        { id: 'pclaim-2', perspective_id: 'perspective-2', text: 'John is not good' },
      ];

      vi.mocked(omegaMemoryService.getClaimsForEntity).mockResolvedValue(mockBaseClaims as any);
      vi.mocked(perspectiveService.getPerspectiveClaims).mockResolvedValue(mockPerspectiveClaims as any);

      // Mock semantic similarity (low = high divergence)
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.1))
        .mockResolvedValueOnce(new Array(1536).fill(0.9));

      const divergences = await insightReflectionService.detectPerspectiveDivergence('user-123', 'entity-1');

      expect(divergences).toBeDefined();
      expect(Array.isArray(divergences)).toBe(true);
    });
  });

  describe('getInsights', () => {
    it('should get insights with filters', async () => {
      const mockInsights = [
        {
          id: 'insight-1',
          type: 'PATTERN',
          title: 'Test pattern',
          description: 'Test description',
          confidence: 0.8,
          scope: 'ENTITY',
          dismissed: false,
        }
      ];

      // Chain: select('*').eq('user_id', userId).order(...).eq('type', ...).eq('dismissed', ...)
      // The order() returns a query that can be chained with more eq() calls
      const mockEqDismissed = vi.fn().mockResolvedValue({ data: mockInsights, error: null });
      const mockEqType = vi.fn().mockReturnValue({ eq: mockEqDismissed });
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEqType });
      const mockEqUserId = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUserId });
      
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: mockSelect,
      } as any);

      const insights = await insightReflectionService.getInsights('user-123', {
        type: 'PATTERN',
        dismissed: false,
      });

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('PATTERN');
    });
  });

  describe('explainInsight', () => {
    it('should return insight with evidence', async () => {
      const mockInsight = {
        id: 'insight-1',
        type: 'PATTERN',
        title: 'Test pattern',
        description: 'Test description',
        confidence: 0.8,
        scope: 'ENTITY',
        dismissed: false,
      };

      const mockEvidence = [
        {
          id: 'evidence-1',
          insight_id: 'insight-1',
          claim_id: 'claim-1',
          explanation: 'Supports pattern',
        }
      ];

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockInsight, error: null })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockEvidence, error: null })
            })
          })
        } as any);

      const explanation = await insightReflectionService.explainInsight('insight-1', 'user-123');

      expect(explanation).toBeDefined();
      expect(explanation?.insight).toEqual(mockInsight);
      expect(explanation?.evidence).toHaveLength(1);
      expect(explanation?.disclaimer).toBe('This is an observation, not a fact.');
    });
  });

  describe('dismissInsight', () => {
    it('should dismiss an insight', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      } as any);

      await insightReflectionService.dismissInsight('insight-1', 'user-123');

      expect(supabaseAdmin.from).toHaveBeenCalledWith('insights');
    });
  });
});


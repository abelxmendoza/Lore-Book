import { describe, it, expect, vi, beforeEach } from 'vitest';
import { predictiveContinuityService } from '../../src/services/predictiveContinuityService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { decisionMemoryService } from '../../src/services/decisionMemoryService';
import { insightReflectionService } from '../../src/services/insightReflectionService';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/decisionMemoryService');
vi.mock('../../src/services/insightReflectionService');
vi.mock('../../src/services/omegaMemoryService');
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

describe('PredictiveContinuityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePredictions', () => {
    it('should generate predictions from context', async () => {
      const mockDecisions = [
        { id: 'decision-1', decision_type: 'CAREER' },
        { id: 'decision-2', decision_type: 'CAREER' },
        { id: 'decision-3', decision_type: 'CAREER' },
      ];

      const mockOutcomes = [
        { sentiment: 'POSITIVE', count: 2, claim_ids: ['claim-1'] },
        { sentiment: 'NEGATIVE', count: 1, claim_ids: ['claim-2'] },
      ];

      vi.mocked(decisionMemoryService.getSimilarPastDecisions).mockResolvedValue(mockDecisions as any);
      vi.mocked(decisionMemoryService.summarizeDecision).mockResolvedValue({
        decision: { id: 'decision-1' },
        options: [],
        outcomes: [
          { sentiment: 'POSITIVE', linked_claim_ids: ['claim-1'] },
          { sentiment: 'POSITIVE', linked_claim_ids: ['claim-1'] },
          { sentiment: 'NEGATIVE', linked_claim_ids: ['claim-2'] },
        ],
      } as any);

      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'Based on similar past decisions, outcomes tend to be positive.'
                }
              }]
            })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'prediction-1',
                  title: 'Likely outcome',
                  probability: 0.7,
                  confidence: 0.6,
                },
                error: null
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({ data: null, error: null })
        } as any)
        .mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        } as any);

      const predictions = await predictiveContinuityService.generatePredictions('user-123', {
        entity_ids: ['entity-1'],
      });

      expect(predictions).toBeDefined();
      expect(Array.isArray(predictions)).toBe(true);
    });
  });

  describe('getPredictions', () => {
    it('should get predictions for user', async () => {
      const mockPredictions = [
        {
          id: 'prediction-1',
          title: 'Test prediction',
          probability: 0.7,
          dismissed: false,
        }
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockPredictions, error: null })
              })
            })
          })
        })
      } as any);

      const predictions = await predictiveContinuityService.getPredictions('user-123', {
        dismissed: false,
        limit: 10,
      });

      expect(predictions).toHaveLength(1);
      expect(predictions[0].id).toBe('prediction-1');
    });
  });

  describe('explainPrediction', () => {
    it('should return prediction with evidence', async () => {
      const mockPrediction = {
        id: 'prediction-1',
        title: 'Test prediction',
        probability: 0.7,
      };

      const mockEvidence = [
        {
          id: 'evidence-1',
          prediction_id: 'prediction-1',
          source_type: 'DECISION_HISTORY',
          explanation: 'Based on past decisions',
        }
      ];

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockPrediction, error: null })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockEvidence, error: null })
              })
            })
          })
        } as any);

      const explanation = await predictiveContinuityService.explainPrediction(
        'prediction-1',
        'user-123'
      );

      expect(explanation).toBeDefined();
      expect(explanation?.prediction).toEqual(mockPrediction);
      expect(explanation?.evidence).toHaveLength(1);
    });
  });

  describe('dismissPrediction', () => {
    it('should dismiss a prediction', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      } as any);

      await expect(
        predictiveContinuityService.dismissPrediction('prediction-1', 'user-123')
      ).resolves.not.toThrow();
    });
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decisionMemoryService } from '../../src/services/decisionMemoryService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { perspectiveService } from '../../src/services/perspectiveService';
import { insightReflectionService } from '../../src/services/insightReflectionService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/omegaMemoryService');
vi.mock('../../src/services/perspectiveService');
vi.mock('../../src/services/insightReflectionService');
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    emitEvent: vi.fn(),
  }
}));
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

describe('DecisionMemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordDecision', () => {
    it('should record a decision with options and rationale', async () => {
      const mockDecision = {
        id: 'decision-1',
        user_id: 'user-123',
        title: 'Career decision',
        description: 'Should I take this job?',
        decision_type: 'CAREER',
        created_at: new Date().toISOString(),
      };

      const mockOption = {
        id: 'option-1',
        decision_id: 'decision-1',
        option_text: 'Take the job',
        created_at: new Date().toISOString(),
      };

      const mockRationale = {
        id: 'rationale-1',
        decision_id: 'decision-1',
        reasoning: 'Better opportunity',
        created_at: new Date().toISOString(),
      };

      vi.mocked(perspectiveService.getOrCreateDefaultPerspectives).mockResolvedValue([
        { id: 'perspective-1', type: 'SELF', label: 'Self' }
      ]);

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDecision, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockOption, error: null })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockRationale, error: null })
            })
          })
        } as any);

      const summary = await decisionMemoryService.recordDecision(
        'user-123',
        {
          title: 'Career decision',
          description: 'Should I take this job?',
          decision_type: 'CAREER',
        },
        [
          {
            option_text: 'Take the job',
            perceived_risks: 'Long hours',
            perceived_rewards: 'Better pay',
          }
        ],
        {
          reasoning: 'Better opportunity',
          values_considered: ['growth', 'stability'],
          emotions_present: ['excitement', 'anxiety'],
        }
      );

      expect(summary.decision).toBeDefined();
      expect(summary.options).toHaveLength(1);
      expect(summary.rationale).toBeDefined();
    });
  });

  describe('recordDecisionOutcome', () => {
    it('should record outcome for a decision', async () => {
      const mockDecision = {
        id: 'decision-1',
        user_id: 'user-123',
        entity_ids: ['entity-1'],
      };

      const mockOutcome = {
        id: 'outcome-1',
        decision_id: 'decision-1',
        outcome_text: 'Took the job and it worked out well',
        sentiment: 'POSITIVE',
        recorded_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDecision, error: null })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockOutcome, error: null })
            })
          })
        } as any);

      const outcome = await decisionMemoryService.recordDecisionOutcome(
        'user-123',
        'decision-1',
        {
          outcome_text: 'Took the job and it worked out well',
          sentiment: 'POSITIVE',
        }
      );

      expect(outcome).toBeDefined();
      expect(outcome.outcome_text).toBe('Took the job and it worked out well');
    });
  });

  describe('summarizeDecision', () => {
    it('should return decision summary with all related data', async () => {
      const mockDecision = {
        id: 'decision-1',
        user_id: 'user-123',
        title: 'Career decision',
      };

      const mockOptions = [
        { id: 'option-1', decision_id: 'decision-1', option_text: 'Option 1' },
      ];

      const mockRationale = {
        id: 'rationale-1',
        decision_id: 'decision-1',
        reasoning: 'Test reasoning',
      };

      const mockOutcomes = [
        { id: 'outcome-1', decision_id: 'decision-1', outcome_text: 'Outcome 1' },
      ];

      // Mock decision query: from('decisions').select('*').eq('id').eq('user_id').single()
      const mockDecisionSelect = vi.fn();
      const mockDecisionEq1 = vi.fn();
      const mockDecisionEq2 = vi.fn();
      const mockDecisionSingle = vi.fn();
      
      mockDecisionSelect.mockReturnValue({
        eq: mockDecisionEq1
      });
      mockDecisionEq1.mockReturnValue({
        eq: mockDecisionEq2
      });
      mockDecisionEq2.mockReturnValue({
        single: mockDecisionSingle
      });
      mockDecisionSingle.mockResolvedValue({ data: mockDecision, error: null });

      // Mock options query: from('decision_options').select('*').eq('decision_id').eq('user_id').order()
      const mockOptionsSelect = vi.fn();
      const mockOptionsEq1 = vi.fn();
      const mockOptionsEq2 = vi.fn();
      const mockOptionsOrder = vi.fn();
      
      mockOptionsSelect.mockReturnValue({
        eq: mockOptionsEq1
      });
      mockOptionsEq1.mockReturnValue({
        eq: mockOptionsEq2
      });
      mockOptionsEq2.mockReturnValue({
        order: mockOptionsOrder
      });
      mockOptionsOrder.mockResolvedValue({ data: mockOptions, error: null });

      // Mock rationale query: from('decision_rationales').select('*').eq('decision_id').eq('user_id').single()
      const mockRationaleSelect = vi.fn();
      const mockRationaleEq1 = vi.fn();
      const mockRationaleEq2 = vi.fn();
      const mockRationaleSingle = vi.fn();
      
      mockRationaleSelect.mockReturnValue({
        eq: mockRationaleEq1
      });
      mockRationaleEq1.mockReturnValue({
        eq: mockRationaleEq2
      });
      mockRationaleEq2.mockReturnValue({
        single: mockRationaleSingle
      });
      mockRationaleSingle.mockResolvedValue({ data: mockRationale, error: null });

      // Mock outcomes query: from('decision_outcomes').select('*').eq('decision_id').eq('user_id').order()
      const mockOutcomesSelect = vi.fn();
      const mockOutcomesEq1 = vi.fn();
      const mockOutcomesEq2 = vi.fn();
      const mockOutcomesOrder = vi.fn();
      
      mockOutcomesSelect.mockReturnValue({
        eq: mockOutcomesEq1
      });
      mockOutcomesEq1.mockReturnValue({
        eq: mockOutcomesEq2
      });
      mockOutcomesEq2.mockReturnValue({
        order: mockOutcomesOrder
      });
      mockOutcomesOrder.mockResolvedValue({ data: mockOutcomes, error: null });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: mockDecisionSelect,
        } as any)
        .mockReturnValueOnce({
          select: mockOptionsSelect,
        } as any)
        .mockReturnValueOnce({
          select: mockRationaleSelect,
        } as any)
        .mockReturnValueOnce({
          select: mockOutcomesSelect,
        } as any);

      const summary = await decisionMemoryService.summarizeDecision('decision-1', 'user-123');

      expect(summary).toBeDefined();
      expect(summary?.decision).toEqual(mockDecision);
      expect(summary?.options).toHaveLength(1);
      expect(summary?.rationale).toBeDefined();
      expect(summary?.outcomes).toHaveLength(1);
    });
  });

  describe('getSimilarPastDecisions', () => {
    it('should find similar past decisions', async () => {
      const mockDecisions = [
        {
          id: 'decision-1',
          title: 'Career decision',
          decision_type: 'CAREER',
          entity_ids: ['entity-1'],
        }
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockDecisions, error: null })
          })
        })
      } as any);

      const similar = await decisionMemoryService.getSimilarPastDecisions(
        'user-123',
        {
          decision_type: 'CAREER',
          entity_ids: ['entity-1'],
        }
      );

      expect(similar).toBeDefined();
      expect(Array.isArray(similar)).toBe(true);
    });
  });
});


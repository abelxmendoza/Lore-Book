import { describe, it, expect, vi, beforeEach } from 'vitest';
import { goalValueAlignmentService } from '../../src/services/goalValueAlignmentService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { decisionMemoryService } from '../../src/services/decisionMemoryService';
import { insightReflectionService } from '../../src/services/insightReflectionService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/omegaMemoryService');
vi.mock('../../src/services/decisionMemoryService');
vi.mock('../../src/services/insightReflectionService');
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

describe('GoalValueAlignmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('declareValue', () => {
    it('should declare a value', async () => {
      const mockValue = {
        id: 'value-1',
        user_id: 'user-123',
        name: 'Freedom',
        description: 'Value freedom and independence',
        priority: 0.8,
        created_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockValue, error: null })
          })
        })
      } as any);

      const value = await goalValueAlignmentService.declareValue('user-123', {
        name: 'Freedom',
        description: 'Value freedom and independence',
        priority: 0.8,
      });

      expect(value).toBeDefined();
      expect(value.name).toBe('Freedom');
    });
  });

  describe('declareGoal', () => {
    it('should declare a goal', async () => {
      const mockGoal = {
        id: 'goal-1',
        user_id: 'user-123',
        title: 'Career goal',
        description: 'Advance in career',
        goal_type: 'CAREER',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockGoal, error: null })
            })
          })
        } as any)
        .mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null })
        } as any);

      vi.mocked(omegaMemoryService.getEntities).mockResolvedValue([]);
      vi.mocked(decisionMemoryService.getDecisions).mockResolvedValue([]);
      vi.mocked(insightReflectionService.getInsights).mockResolvedValue([]);

      const goal = await goalValueAlignmentService.declareGoal('user-123', {
        title: 'Career goal',
        description: 'Advance in career',
        goal_type: 'CAREER',
        target_timeframe: 'MEDIUM',
      });

      expect(goal).toBeDefined();
      expect(goal.title).toBe('Career goal');
    });
  });

  describe('computeAlignment', () => {
    it('should compute alignment for a goal', async () => {
      const mockGoal = {
        id: 'goal-1',
        user_id: 'user-123',
        title: 'Career goal',
      };

      const mockSignals = [
        {
          id: 'signal-1',
          goal_id: 'goal-1',
          alignment_score: 0.7,
          recorded_at: new Date().toISOString(),
        },
        {
          id: 'signal-2',
          goal_id: 'goal-1',
          alignment_score: 0.8,
          recorded_at: new Date().toISOString(),
        },
      ];

      // Mock getGoalSignals query: from('goal_signals').select('*').eq('user_id').eq('goal_id').order()
      const mockSelect = vi.fn();
      const mockEq1 = vi.fn();
      const mockEq2 = vi.fn();
      const mockOrder = vi.fn();
      
      mockSelect.mockReturnValue({
        eq: mockEq1
      });
      mockEq1.mockReturnValue({
        eq: mockEq2
      });
      mockEq2.mockReturnValue({
        order: mockOrder
      });
      mockOrder.mockResolvedValue({ data: mockSignals, error: null });
      
      // Ensure mockSignals has the required fields for alignment calculation
      expect(mockSignals.length).toBeGreaterThan(0);

      const mockInsert = vi.fn();
      const mockInsertSelect = vi.fn();
      const mockInsertSingle = vi.fn();
      
      mockInsert.mockReturnValue({
        select: mockInsertSelect
      });
      mockInsertSelect.mockReturnValue({
        single: mockInsertSingle
      });
      mockInsertSingle.mockResolvedValue({
        data: {
          id: 'snapshot-1',
          alignment_score: 0.75,
          confidence: 0.6,
          user_id: 'user-123',
          goal_id: 'goal-1',
          time_window: { start: '2025-01-01', end: '2025-01-02' },
          generated_at: new Date().toISOString(),
        },
        error: null
      });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: mockSelect,
        } as any)
        .mockReturnValueOnce({
          insert: mockInsert,
        } as any);

      const snapshot = await goalValueAlignmentService.computeAlignment('user-123', 'goal-1');

      expect(snapshot).toBeDefined();
      expect(snapshot.alignment_score).toBe(0.75);
    });
  });

  describe('detectGoalDrift', () => {
    it('should detect downward drift', async () => {
      const mockGoal = {
        id: 'goal-1',
        user_id: 'user-123',
        title: 'Career goal',
      };

      const mockSnapshots = [
        { id: 's1', alignment_score: 0.8, generated_at: '2025-01-01T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
        { id: 's2', alignment_score: 0.8, generated_at: '2025-01-02T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
        { id: 's3', alignment_score: 0.8, generated_at: '2025-01-03T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
        { id: 's4', alignment_score: 0.6, generated_at: '2025-01-04T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
        { id: 's5', alignment_score: 0.4, generated_at: '2025-01-05T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
        { id: 's6', alignment_score: 0.4, generated_at: '2025-01-06T00:00:00Z', user_id: 'user-123', goal_id: 'goal-1' },
      ];

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockGoal, error: null })
              })
            })
          })
        } as any);

      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'Alignment drift observed over time.'
                }
              }]
            })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      const drift = await goalValueAlignmentService.detectGoalDrift('user-123', 'goal-1');

      expect(drift).toBeDefined();
      expect(drift).not.toBeNull();
      expect(drift?.trend).toBe('downward');
    });
  });
});


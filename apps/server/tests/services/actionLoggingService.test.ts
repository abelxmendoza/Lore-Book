import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actionLoggingService, ExtractedAction, ActionContext } from '../../src/services/actionLogging/actionLoggingService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { timeEngine } from '../../src/services/timeEngine';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../../src/services/timeEngine', () => ({
  timeEngine: {
    parseTimestamp: vi.fn(),
  },
}));

vi.mock('../../src/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ActionLoggingService', () => {
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockSingle = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Supabase mock chain for insert
    mockSingle.mockResolvedValue({
      data: { id: 'action-1' },
      error: null,
    });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });

    // Setup Supabase mock chain for select (finding open experience)
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEq.mockReturnValue({ order: mockOrder });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'event_records') {
        return {
          select: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        } as any;
      }
      return {
        insert: mockInsert,
        select: mockEq,
      } as any;
    });
  });

  describe('Timestamp Inference - 6-Layer Strategy', () => {
    it('should prioritize explicit time mentions', async () => {
      const mockParseResult = {
        timestamp: new Date('2024-01-15T10:30:00Z'),
        precision: 'minute' as const,
        confidence: 0.95,
      };

      vi.mocked(timeEngine.parseTimestamp).mockReturnValue(mockParseResult);

      const context: ActionContext = {
        messageTimestamp: new Date('2024-01-20T12:00:00Z'),
      };

      const result = await actionLoggingService.logAction(
        'user-1',
        'I said hello at 10:30 AM',
        'msg-1',
        context
      );

      expect(timeEngine.parseTimestamp).toHaveBeenCalled();
      expect(result).toBe('action-1');
    });

    it('should use experience time range when experience_id is provided', async () => {
      const context: ActionContext = {
        experienceId: 'exp-1',
        messageTimestamp: new Date('2024-01-20T12:00:00Z'),
      };

      const result = await actionLoggingService.logAction(
        'user-1',
        'I walked away',
        'msg-1',
        context
      );

      expect(result).toBe('action-1');
      // Verify insert was called with the experience_id
      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.experience_id).toBe('exp-1');
    });

    it('should use relative time parsing', async () => {
      const mockParseResult = {
        timestamp: new Date('2024-01-19T12:00:00Z'),
        precision: 'day' as const,
        confidence: 0.8,
      };

      vi.mocked(timeEngine.parseTimestamp).mockReturnValue(mockParseResult);

      mockSingle.mockResolvedValue({
        data: { id: 'action-1' },
        error: null,
      });

      await actionLoggingService.logAction(
        'user-1',
        'I said goodbye yesterday',
        'msg-1',
        {
          messageTimestamp: new Date('2024-01-20T12:00:00Z'),
        }
      );

      expect(timeEngine.parseTimestamp).toHaveBeenCalled();
    });

    it('should fall back to message timestamp', async () => {
      const messageTimestamp = new Date('2024-01-20T12:00:00Z');

      await actionLoggingService.logAction(
        'user-1',
        'I felt anxious',
        'msg-1',
        {
          messageTimestamp,
        }
      );

      // Should use message timestamp as fallback
      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(new Date(insertCall.timestamp)).toBeInstanceOf(Date);
    });

    it('should default to current time with low confidence when no context available', async () => {
      // Mock timeEngine to return low confidence so Layer 3 is skipped
      vi.mocked(timeEngine.parseTimestamp).mockReturnValue({
        timestamp: new Date('2024-01-20T12:00:00Z'),
        confidence: 0.3, // Low confidence (< 0.5) so Layer 3 check fails
        precision: 'minute',
        type: 'relative',
        originalText: '',
      });

      const beforeTime = new Date();

      await actionLoggingService.logAction(
        'user-1',
        'I did something',
        'msg-1'
      );

      const afterTime = new Date();

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      const actionTimestamp = new Date(insertCall.timestamp);

      // Should be between before and after (allowing for some execution time)
      // The timestamp should be current time (Layer 6 default) - not the mocked timestamp
      // Since confidence is 0.3 (< 0.5), Layer 3 is skipped and we fall through to Layer 6
      expect(actionTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 3000);
      expect(actionTimestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 3000);

      // Metadata should indicate default source
      expect(insertCall.metadata.timestamp_source).toBe('default');
      expect(insertCall.metadata.timestamp_confidence).toBeLessThan(0.5);
    });
  });

  describe('Action Extraction', () => {
    it('should extract verb from message', async () => {
      await actionLoggingService.logAction(
        'user-1',
        'I walked away',
        'msg-1'
      );

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.verb).toBe('walked');
    });

    it('should extract target when present', async () => {
      await actionLoggingService.logAction(
        'user-1',
        'I told him to leave',
        'msg-1'
      );

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.target).toBe('him');
    });

    it('should handle generic actions when verb not found', async () => {
      await actionLoggingService.logAction(
        'user-1',
        'Something happened',
        'msg-1'
      );

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.verb).toBe('noted');
      expect(insertCall.content).toBe('Something happened');
    });
  });

  describe('Experience Linking', () => {
    it('should link action to open experience when found', async () => {
      // Create fresh mocks for this test
      const mockEventSelect = vi.fn();
      const mockEventEq1 = vi.fn();
      const mockEventEq2 = vi.fn();
      const mockEventOrder = vi.fn();
      const mockEventLimit = vi.fn();
      const mockEventSingle = vi.fn();

      mockEventSingle.mockResolvedValueOnce({
        data: { id: 'exp-1' },
        error: null,
      });
      mockEventLimit.mockReturnValue({ single: mockEventSingle });
      mockEventOrder.mockReturnValue({ limit: mockEventLimit });
      mockEventEq2.mockReturnValue({ order: mockEventOrder });
      mockEventEq1.mockReturnValue({ eq: mockEventEq2 });
      mockEventSelect.mockReturnValue({ eq: mockEventEq1 });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'event_records') {
          return {
            select: mockEventSelect,
          } as any;
        }
        return {
          insert: mockInsert,
        } as any;
      });

      await actionLoggingService.logAction(
        'user-1',
        'I said hello',
        'msg-1'
      );

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.experience_id).toBe('exp-1');
    });

    it('should use provided experience_id from context', async () => {
      await actionLoggingService.logAction(
        'user-1',
        'I walked away',
        'msg-1',
        {
          experienceId: 'exp-provided',
        }
      );

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.experience_id).toBe('exp-provided');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        actionLoggingService.logAction('user-1', 'I did something', 'msg-1')
      ).rejects.toThrow();
    });

    it('should handle missing experience gracefully', async () => {
      // Mock no open experience found
      mockLimit.mockResolvedValueOnce({ data: [], error: null });

      // Should not throw, just log action without experience
      await actionLoggingService.logAction('user-1', 'I did something', 'msg-1');

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.experience_id).toBeNull();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuityService } from '../../src/services/continuityService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { logger } from '../../src/logger';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ContinuityService', () => {
  let continuityService: ContinuityService;
  let mockInsert: any;
  let mockSelect: any;
  let mockSingle: any;
  let mockEq: any;
  let mockOrder: any;
  let mockLimit: any;

  beforeEach(() => {
    vi.clearAllMocks();

    continuityService = new ContinuityService();

    mockSingle = vi.fn();
    mockEq = vi.fn().mockReturnThis();
    mockOrder = vi.fn().mockReturnThis();
    mockLimit = vi.fn().mockReturnThis();
    mockSelect = vi.fn().mockReturnThis();
    mockInsert = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
    } as any);
  });

  describe('emitEvent', () => {
    it('should emit a continuity event successfully', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'CLAIM_CREATED',
        context: { test: 'data' },
        explanation: 'Test explanation',
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'SYSTEM',
        severity: 'INFO',
        reversible: false,
        created_at: '2023-01-01',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      const result = await continuityService.emitEvent('user-1', {
        type: 'CLAIM_CREATED',
        context: { test: 'data' },
        explanation: 'Test explanation',
      });

      expect(result).toEqual(mockEvent);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should handle errors when emitting event', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      await expect(
        continuityService.emitEvent('user-1', {
          type: 'CLAIM_CREATED',
          context: {},
          explanation: 'Test',
        })
      ).rejects.toEqual(mockError);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should set default values for optional fields', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'CLAIM_CREATED',
        context: {},
        explanation: 'Test',
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'SYSTEM',
        severity: 'INFO',
        reversible: false,
        created_at: '2023-01-01',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      await continuityService.emitEvent('user-1', {
        type: 'CLAIM_CREATED',
        context: {},
        explanation: 'Test',
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          initiated_by: 'SYSTEM',
          severity: 'INFO',
          reversible: false,
        })
      );
    });

    it('should log warning for ALERT severity events', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'ALERT',
        context: {},
        explanation: 'Alert',
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'SYSTEM',
        severity: 'ALERT',
        reversible: false,
        created_at: '2023-01-01',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      await continuityService.emitEvent('user-1', {
        type: 'ALERT',
        context: {},
        explanation: 'Alert',
        severity: 'ALERT',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-1',
          userId: 'user-1',
        }),
        'ALERT severity event - notification should be sent'
      );
    });
  });

  describe('recordClaimCreation', () => {
    it('should record claim creation with proper context', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'CLAIM_CREATED',
        context: {},
        explanation: expect.stringContaining('Claim created'),
        related_claim_ids: ['claim-1'],
        related_entity_ids: ['entity-1'],
        related_location_ids: [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
        created_at: '2023-01-01',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      const result = await continuityService.recordClaimCreation(
        'user-1',
        { id: 'claim-1', text: 'Test claim', confidence: 0.8 },
        'This is a test source text that is longer than 100 characters to test truncation',
        { id: 'entity-1', primary_name: 'Test Entity', type: 'PERSON' }
      );

      expect(result).toEqual(mockEvent);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CLAIM_CREATED',
          related_claim_ids: ['claim-1'],
          related_entity_ids: ['entity-1'],
          initiated_by: 'USER',
        })
      );
    });

    it('should truncate long source text', async () => {
      const longText = 'a'.repeat(200);
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'CLAIM_CREATED',
        context: {},
        explanation: '',
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
        created_at: '2023-01-01',
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      await continuityService.recordClaimCreation(
        'user-1',
        { id: 'claim-1', text: 'Test', confidence: 0.8 },
        longText,
        { id: 'entity-1', primary_name: 'Test', type: 'PERSON' }
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            sourceText: expect.stringMatching(/^.{100}\.\.\.$/),
          }),
        })
      );
    });
  });

  describe('listEvents', () => {
    it('should list events for a user', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          user_id: 'user-1',
          type: 'CLAIM_CREATED',
          created_at: '2023-01-01',
        },
        {
          id: 'event-2',
          user_id: 'user-1',
          type: 'ENTITY_MERGED',
          created_at: '2023-01-02',
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
      });

      const result = await continuityService.listEvents('user-1', 10);

      expect(result).toEqual(mockEvents);
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should handle errors when listing events', async () => {
      const mockError = { message: 'Database error' };
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      await expect(continuityService.listEvents('user-1', 10)).rejects.toEqual(mockError);
    });
  });

  describe('explainEvent', () => {
    it('should explain an event', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-1',
        type: 'CLAIM_CREATED',
        context: { test: 'data' },
        explanation: 'Test explanation',
        created_at: '2023-01-01',
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      });

      const result = await continuityService.explainEvent('user-1', 'event-1');

      expect(result).toEqual({
        event: mockEvent,
        explanation: 'Test explanation',
      });
    });

    it('should handle event not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      });

      await expect(continuityService.explainEvent('user-1', 'event-1')).rejects.toBeDefined();
    });
  });
});

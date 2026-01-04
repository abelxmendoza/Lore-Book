import { describe, it, expect, vi, beforeEach } from 'vitest';
import { continuityService } from '../../src/services/continuityService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('ContinuityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('emitEvent', () => {
    it('should create a continuity event', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-123',
        type: 'CLAIM_CREATED',
        timestamp: new Date().toISOString(),
        context: { test: 'data' },
        explanation: 'Test explanation',
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: true,
        created_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
          })
        })
      } as any);

      const result = await continuityService.emitEvent('user-123', {
        type: 'CLAIM_CREATED',
        context: { test: 'data' },
        explanation: 'Test explanation',
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: true,
      });

      expect(result).toEqual(mockEvent);
    });
  });

  describe('recordClaimCreation', () => {
    it('should record claim creation event', async () => {
      const mockClaim = {
        id: 'claim-1',
        text: 'Test claim',
        confidence: 0.8,
      };

      const mockEntity = {
        id: 'entity-1',
        primary_name: 'John Doe',
        type: 'PERSON',
      };

      const mockEvent = {
        id: 'event-1',
        user_id: 'user-123',
        type: 'CLAIM_CREATED',
        explanation: 'Claim created about John Doe from input: "Source text here"',
        reversible: true,
        timestamp: new Date().toISOString(),
        context: {},
        related_claim_ids: [],
        related_entity_ids: [],
        related_location_ids: [],
        initiated_by: 'USER',
        severity: 'INFO',
        created_at: new Date().toISOString(),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
          })
        })
      } as any);

      const result = await continuityService.recordClaimCreation(
        'user-123',
        mockClaim,
        'Source text here',
        mockEntity
      );

      expect(result.type).toBe('CLAIM_CREATED');
      expect(result.explanation).toContain('John Doe');
    });
  });

  describe('recordContradiction', () => {
    it('should record contradiction event', async () => {
      const claimA = {
        id: 'claim-1',
        text: 'John is good',
        confidence: 0.8,
        entity_id: 'entity-1',
      };

      const claimB = {
        id: 'claim-2',
        text: 'John is not good',
        confidence: 0.7,
        entity_id: 'entity-1',
      };

      const mockEvent = {
        id: 'event-1',
        type: 'CONTRADICTION_FOUND',
        severity: 'WARNING',
        reversible: false,
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
          })
        })
      } as any);

      const result = await continuityService.recordContradiction(
        'user-123',
        claimA,
        claimB
      );

      expect(result.type).toBe('CONTRADICTION_FOUND');
      expect(result.severity).toBe('WARNING');
    });
  });

  describe('recordEntityMerge', () => {
    it('should record entity merge event', async () => {
      const mergeData = {
        source_entity_id: 'entity-1',
        target_entity_id: 'entity-2',
        merged_claim_ids: ['claim-1', 'claim-2'],
        source_entity: { id: 'entity-1', primary_name: 'John' },
        target_entity: { id: 'entity-2', primary_name: 'John Doe' },
      };

      const mockEvent = {
        id: 'event-1',
        type: 'ENTITY_MERGED',
        reversible: true,
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
          })
        })
      } as any);

      const result = await continuityService.recordEntityMerge(
        'user-123',
        mergeData
      );

      expect(result.type).toBe('ENTITY_MERGED');
      expect(result.reversible).toBe(true);
    });
  });

  describe('explainEvent', () => {
    it('should return event explanation with related context', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-123',
        type: 'CLAIM_CREATED',
        timestamp: new Date().toISOString(),
        context: { test: 'data' },
        explanation: 'Test explanation',
        related_claim_ids: ['claim-1'],
        related_entity_ids: ['entity-1'],
        related_location_ids: [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: true,
        created_at: new Date().toISOString(),
      };

      const mockClaim = {
        id: 'claim-1',
        text: 'Test claim',
        confidence: 0.8,
      };

      const mockEntity = {
        id: 'entity-1',
        primary_name: 'John Doe',
        type: 'PERSON',
      };

      // Mock event fetch
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
            })
          })
        })
      } as any);

      // Mock claims fetch
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [mockClaim], error: null })
        })
      } as any);

      // Mock entities fetch
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [mockEntity], error: null })
        })
      } as any);

      const result = await continuityService.explainEvent('event-1', 'user-123');

      expect(result).toBeDefined();
      expect(result?.type).toBe('CLAIM_CREATED');
      expect(result?.related_context?.claims).toHaveLength(1);
      expect(result?.related_context?.entities).toHaveLength(1);
    });
  });

  describe('listEvents', () => {
    it('should list events with filters', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          type: 'CLAIM_CREATED',
          severity: 'INFO',
        },
        {
          id: 'event-2',
          type: 'CONTRADICTION_FOUND',
          severity: 'WARNING',
        },
      ];

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null })
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(mockChain as any);

      const result = await continuityService.listEvents('user-123', {
        limit: 10,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('revertEvent', () => {
    it('should revert a reversible event', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-123',
        type: 'CLAIM_CREATED',
        reversible: true,
        reversal_id: null,
        related_claim_ids: ['claim-1'],
        related_entity_ids: [],
      };

      const mockReversalLog = {
        id: 'reversal-1',
        event_id: 'event-1',
        reversal_timestamp: new Date().toISOString(),
        reversed_by: 'USER',
        reason: 'Test reason',
        snapshot_before: {},
        snapshot_after: {},
      };

      // Mock event fetch with proper chaining
      const mockEventChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
      };
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce(mockEventChain as any);

      // Mock snapshot creation (claims fetch)
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      } as any);

      // Mock claim update (reversal)
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      } as any);

      // Mock reversal log creation
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockReversalLog, error: null })
          })
        })
      } as any);

      // Mock event update (mark as reversed)
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      } as any);

      const result = await continuityService.revertEvent(
        'user-123',
        'event-1',
        'Test reason'
      );

      expect(result).toBeDefined();
      expect(result?.event_id).toBe('event-1');
    });

    it('should not revert non-reversible event', async () => {
      const mockEvent = {
        id: 'event-1',
        user_id: 'user-123',
        type: 'CONTRADICTION_FOUND',
        reversible: false,
        reversal_id: null,
      };

      const mockEventChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null })
      };
      vi.mocked(supabaseAdmin.from).mockReturnValue(mockEventChain as any);

      const result = await continuityService.revertEvent(
        'user-123',
        'event-1',
        'Test reason'
      );

      expect(result).toBeNull();
    });
  });
});


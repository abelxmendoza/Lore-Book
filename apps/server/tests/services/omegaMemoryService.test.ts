import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/embeddingService', () => ({
  embeddingService: {
    embedText: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
  }
}));
// OpenAI must be a constructor; PeoplePlacesService (via memoryService) does new OpenAI()
const { openaiCreateFn } = vi.hoisted(() => ({ openaiCreateFn: vi.fn() }));
vi.mock('openai', () => ({
  default: function OpenAI() {
    return { chat: { completions: { create: openaiCreateFn } } };
  },
}));
vi.mock('../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    defaultModel: 'gpt-4o-mini'
  }
}));
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    emitEvent: vi.fn().mockResolvedValue(undefined),
    recordEntityResolved: vi.fn().mockResolvedValue(undefined)
  }
}));
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('OmegaMemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openaiCreateFn.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            is_contradiction: true,
            confidence: 0.9,
            reason: 'Opposite statements',
          }),
        },
      }],
    });
  });

  describe('resolveEntities', () => {
    it('should find existing entity by name', async () => {
      const mockEntity = {
        id: 'entity-1',
        user_id: 'user-123',
        type: 'PERSON',
        primary_name: 'John Doe',
        aliases: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Create proper chainable mock
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEntity, error: null })
      };

      // Mock continuityService.emitEvent to prevent actual DB calls
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.emitEvent).mockResolvedValue(undefined);

      vi.mocked(supabaseAdmin.from).mockReturnValue(mockChain as any);

      const result = await omegaMemoryService.resolveEntities('user-123', [
        { name: 'John Doe', type: 'PERSON' }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].primary_name).toBe('John Doe');
    });

    it('should create new entity if not found', async () => {
      // Mock continuityService.emitEvent to prevent actual DB calls
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.emitEvent).mockResolvedValue(undefined);
      
      // Mock findEntityByNameOrAlias to return null (not found)
      const mockFindChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      };

      // Mock createEntity
      const newEntity = {
        id: 'entity-2',
        user_id: 'user-123',
        type: 'PERSON',
        primary_name: 'Jane Doe',
        aliases: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockCreateChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: newEntity, error: null })
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(mockFindChain as any)
        .mockReturnValueOnce(mockCreateChain as any);

      const result = await omegaMemoryService.resolveEntities('user-123', [
        { name: 'Jane Doe', type: 'PERSON' }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].primary_name).toBe('Jane Doe');
    });
  });

  describe('conflictDetected', () => {
    it('should detect semantic opposites', async () => {
      // Use a fixed timestamp to ensure exact overlap
      const fixedTime = '2024-01-01T00:00:00Z';
      
      const newClaim = {
        id: 'claim-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John is a good person',
        source: 'USER' as const,
        confidence: 0.8,
        start_time: fixedTime,
        end_time: null, // Ongoing claim
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const existingClaim = {
        id: 'claim-2',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John is not a good person',
        source: 'USER' as const,
        confidence: 0.7,
        start_time: fixedTime, // Same time = temporal overlap
        end_time: null, // Ongoing claim
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock embeddings to be very different (low similarity < 0.3) to trigger LLM check
      // Cosine similarity measures direction, not magnitude. To get low similarity, use opposite directions
      const { embeddingService } = await import('../../src/services/embeddingService');
      // Use positive values for one, negative for the other to get low cosine similarity
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.5)) // newClaim embedding (all positive)
        .mockResolvedValueOnce(new Array(1536).fill(-0.5)); // existingClaim embedding (all negative = opposite direction = low similarity)

      // The LLM will throw an error (mocked), so it will fall back to semanticOpposite
      // semanticOpposite should detect "is" vs "is not" pattern
      const hasConflict = await omegaMemoryService.conflictDetected(newClaim, [existingClaim]);
      expect(hasConflict).toBe(true);
    });

    it('should not detect conflict for unrelated claims', async () => {
      const newClaim = {
        id: 'claim-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John likes pizza',
        source: 'USER' as const,
        confidence: 0.8,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const existingClaim = {
        id: 'claim-2',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John lives in New York',
        source: 'USER' as const,
        confidence: 0.7,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const hasConflict = await omegaMemoryService.conflictDetected(newClaim, [existingClaim]);
      expect(hasConflict).toBe(false);
    });
  });

  describe('rankClaims', () => {
    it('should rank claims by score', async () => {
      const claims = [
        {
          id: 'claim-1',
          user_id: 'user-123',
          entity_id: 'entity-1',
          text: 'Old claim',
          source: 'USER' as const,
          confidence: 0.5,
          start_time: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'claim-2',
          user_id: 'user-123',
          entity_id: 'entity-1',
          text: 'Recent claim',
          source: 'USER' as const,
          confidence: 0.9,
          start_time: new Date().toISOString(), // Recent
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      // Mock claims fetch
      const mockClaimsChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: claims, error: null })
      };

      // Mock evidence count queries (called for each claim)
      const mockEvidenceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 0, error: null })
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(mockClaimsChain as any) // First call for claims
        .mockReturnValue(mockEvidenceChain as any); // Subsequent calls for evidence

      const ranked = await omegaMemoryService.rankClaims('entity-1');

      expect(ranked).toBeDefined();
      expect(ranked.length).toBe(2);
      // Recent claim should rank higher due to recency and confidence
      expect(ranked[0].id).toBe('claim-2');
    });
  });
});

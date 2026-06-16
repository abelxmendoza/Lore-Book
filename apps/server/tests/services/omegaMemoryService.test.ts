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
      vi.mocked(continuityService.emitEvent).mockResolvedValue(undefined as any);

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
      vi.mocked(continuityService.emitEvent).mockResolvedValue(undefined as any);
      
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

      // createEntity re-checks for a concurrently-created entity before inserting
      const mockRaceCheckChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      };

      // resolveEntities call order:
      //   1. batch load (empty pool)       → mockBatchChain
      //   2. exact match query             → mockFindChain (returns null via .single())
      //   3. fuzzy scan (all entities)     → mockFuzzyScanChain (returns empty)
      //   4. (rpc semantic search — auto-mocked, returns undefined, caught gracefully)
      //   5. createEntity race-check       → mockRaceCheckChain (returns null)
      //   6. createEntity insert           → mockCreateChain
      const mockBatchChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };

      const mockFuzzyScanChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(mockBatchChain as any)      // 1. batch load
        .mockReturnValueOnce(mockFindChain as any)       // 2. exact match
        .mockReturnValueOnce(mockFuzzyScanChain as any)  // 3. fuzzy scan
        .mockReturnValueOnce(mockRaceCheckChain as any)  // 4. createEntity race-check
        .mockReturnValueOnce(mockCreateChain as any);    // 5. createEntity insert

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

      // Mock entity ownership check
      const mockEntityChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'entity-1' }, error: null }),
      };

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
        .mockReturnValueOnce(mockEntityChain as any) // ownership
        .mockReturnValueOnce(mockClaimsChain as any) // claims
        .mockReturnValue(mockEvidenceChain as any); // evidence

      const ranked = await omegaMemoryService.rankClaims('user-123', 'entity-1');

      expect(ranked).toBeDefined();
      expect(ranked.length).toBe(2);
      // Recent claim should rank higher due to recency and confidence
      expect(ranked[0].id).toBe('claim-2');
    });
  });
});

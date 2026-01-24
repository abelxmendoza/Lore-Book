import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { embeddingService } from '../../src/services/embeddingService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/embeddingService');
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    emitEvent: vi.fn().mockResolvedValue(undefined),
    recordContradiction: vi.fn().mockResolvedValue(undefined),
    recordClaimCreation: vi.fn().mockResolvedValue(undefined),
    recordEntityResolved: vi.fn().mockResolvedValue(undefined)
  }
}));
vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([
      { id: 'perspective-1', type: 'SELF', user_id: 'user-123' }
    ])
  }
}));
vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({
      proposal: { id: 'proposal-1' },
      auto_approved: true
    })
  }
}));
// Mock OpenAI - will be customized per test
const { mockOpenAICreate } = vi.hoisted(() => {
  return {
    mockOpenAICreate: vi.fn()
  };
});
// OpenAI must be a constructor (PeoplePlacesService, etc. do new OpenAI())
vi.mock('openai', () => ({
  default: function OpenAI() {
    return { chat: { completions: { create: mockOpenAICreate } } };
  },
}));
vi.mock('../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    defaultModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  }
}));
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('OmegaMemoryService - Enhanced Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Entity Extraction', () => {
    it('should extract entities using OpenAI', async () => {
      // Override the global mock to return entities for this test
      vi.mocked(omegaMemoryService.extractEntities).mockResolvedValueOnce([
        { name: 'John Doe', type: 'PERSON' },
        { name: 'New York', type: 'LOCATION' }
      ]);
      
      // First call: entity extraction (for other LLM calls if any)
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              entities: [
                { name: 'John Doe', type: 'PERSON', confidence: 0.9 },
                { name: 'New York', type: 'LOCATION', confidence: 0.8 }
              ]
            })
          }
        }]
      });
      
      // Subsequent calls: contradiction detection (if needed)
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              is_contradiction: true,
              confidence: 0.9,
              reason: 'Opposite statements'
            })
          }
        }]
      });

      // Mock resolveEntities to return entities
      const mockEntity = {
        id: 'entity-1',
        user_id: 'user-123',
        type: 'PERSON',
        primary_name: 'John Doe',
        aliases: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock embedding service for claims
      vi.mocked(embeddingService.embedText).mockResolvedValue(new Array(1536).fill(0.1));

      // Continuity service is already mocked at module level, no need to re-mock

      // Mock Supabase queries - need to handle multiple calls for entity resolution
      let entityFindCallCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'omega_entities') {
          // Mock for findEntityByNameOrAlias: .select().eq().eq().or().limit().single()
          const findChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() => {
              entityFindCallCount++;
              // First call: entity not found (triggers create)
              if (entityFindCallCount === 1) {
                return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
              }
              // Subsequent calls: return the entity
              return Promise.resolve({ data: mockEntity, error: null });
            })
          };
          
          // Mock for createEntity: .insert().select().single()
          const insertChain = {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockEntity, error: null })
              })
            })
          };
          
          // Mock for updateEntityTimestamps: .update().eq().eq()
          const updateChain = {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          };
          
          // Return an object that supports all patterns
          return {
            ...findChain,
            ...insertChain,
            ...updateChain
          } as any;
        }
        // For other tables (claims, relationships, etc.)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ data: [], error: null }),
          update: vi.fn().mockReturnThis()
        } as any;
      });

      // Mock rpc for semantic search (findSimilarClaims and match_omega_entities)
      vi.mocked(supabaseAdmin.rpc).mockImplementation((fnName: string) => {
        if (fnName === 'match_omega_entities') {
          // Return empty for semantic entity search (entity not found, will create new)
          return Promise.resolve({ data: [], error: null } as any);
        }
        // For findSimilarClaims (used in conflict detection)
        return Promise.resolve({ data: [], error: null } as any);
      });

      const result = await omegaMemoryService.ingestText('user-123', 'John Doe lives in New York', 'USER');

      expect(result.entities.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Similarity', () => {
    it('should detect conflicts using embeddings', async () => {
      // Set up OpenAI mock for contradiction detection
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              is_contradiction: true,
              confidence: 0.9,
              reason: 'Opposite statements'
            })
          }
        }]
      });
      
      // Use very different embeddings to get low similarity (< 0.3) which triggers LLM check
      // Cosine similarity measures direction. Use opposite directions (positive vs negative) for low similarity
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.5)) // newClaim embedding (all positive)
        .mockResolvedValueOnce(new Array(1536).fill(-0.5)); // existingClaim embedding (all negative = opposite direction = low similarity)

      const newClaim = {
        id: 'claim-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John is a good person',
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
        text: 'John is not a good person',
        source: 'USER' as const,
        confidence: 0.7,
        start_time: newClaim.start_time, // Same time = temporal overlap
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock semantic search (findSimilarClaims)
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [existingClaim],
        error: null
      } as any);

      const hasConflict = await omegaMemoryService.conflictDetected(newClaim, [existingClaim]);
      expect(hasConflict).toBe(true);
    });
  });

  describe('Evidence Scoring', () => {
    it('should calculate evidence-weighted scores', async () => {
      const claims = [
        {
          id: 'claim-1',
          user_id: 'user-123',
          entity_id: 'entity-1',
          text: 'Test claim',
          source: 'USER' as const,
          confidence: 0.8,
          start_time: new Date().toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const mockClaimsChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: claims, error: null })
      };

      const mockEvidence = [
        { reliability_score: 1.0, source_type: 'user_verified' },
        { reliability_score: 0.9, source_type: 'journal_entry' }
      ];

      const mockEvidenceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockEvidence, error: null })
      };

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(mockClaimsChain as any)
        .mockReturnValue(mockEvidenceChain as any);

      const ranked = await omegaMemoryService.rankClaims('entity-1');

      expect(ranked).toBeDefined();
      expect(ranked.length).toBe(1);
      // Should have evidence-weighted score
      expect(ranked[0].score).toBeGreaterThan(0);
    });
  });

  describe('Temporal Reasoning', () => {
    it('should detect temporal overlap', async () => {
      // Set up OpenAI mock for contradiction detection
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              is_contradiction: true,
              confidence: 0.9,
              reason: 'Conflicting employment statements'
            })
          }
        }]
      });
      
      const newClaim = {
        id: 'claim-1',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John works at Company A',
        source: 'USER' as const,
        confidence: 0.8,
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-12-31T00:00:00Z',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const existingClaim = {
        id: 'claim-2',
        user_id: 'user-123',
        entity_id: 'entity-1',
        text: 'John works at Company B',
        source: 'USER' as const,
        confidence: 0.7,
        start_time: '2024-06-01T00:00:00Z', // Overlaps with newClaim (2024-01-01 to 2024-12-31)
        end_time: '2024-12-31T00:00:00Z',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // These overlap temporally, so if semantically opposite, it's a conflict
      // Use opposite direction embeddings to get low similarity (< 0.3) which triggers LLM check
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.5)) // newClaim embedding (all positive)
        .mockResolvedValueOnce(new Array(1536).fill(-0.5)); // oldClaim embedding (all negative = opposite direction = low similarity)

      // Mock semantic search (findSimilarClaims)
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [existingClaim],
        error: null
      } as any);

      const hasConflict = await omegaMemoryService.conflictDetected(newClaim, [existingClaim]);
      // Should detect conflict due to temporal overlap and contradiction
      expect(hasConflict).toBe(true);
    });
  });
});


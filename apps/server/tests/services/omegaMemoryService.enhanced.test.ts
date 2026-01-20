import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { embeddingService } from '../../src/services/embeddingService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import OpenAI from 'openai';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/embeddingService');
vi.mock('openai');
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
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
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
            })
          }
        }
      };

      (OpenAI as any).mockImplementation(() => mockOpenAI);

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

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEntity, error: null })
      } as any);

      const result = await omegaMemoryService.ingestText('user-123', 'John Doe lives in New York', 'USER');

      expect(result.entities.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Similarity', () => {
    it('should detect conflicts using embeddings', async () => {
      // Use very different embeddings to get low similarity (< 0.3) which triggers LLM check
      // One embedding all 0.1, other all 0.9 gives cosine similarity ~0.1 (very low)
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.1)) // newClaim embedding
        .mockResolvedValueOnce(new Array(1536).fill(0.9)); // existingClaim embedding (very different)

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
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock semantic search
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [existingClaim],
        error: null
      } as any);

      // Mock LLM contradiction detection
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    is_contradiction: true,
                    confidence: 0.9,
                    reason: 'Opposite statements'
                  })
                }
              }]
            })
          }
        }
      };
      (OpenAI as any).mockImplementation(() => mockOpenAI);

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
        start_time: '2024-06-01T00:00:00Z',
        end_time: '2024-12-31T00:00:00Z',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // These overlap temporally, so if semantically opposite, it's a conflict
      // Use different embeddings to get low similarity (< 0.3) which triggers LLM check
      vi.mocked(embeddingService.embedText)
        .mockResolvedValueOnce(new Array(1536).fill(0.1)) // newClaim embedding
        .mockResolvedValueOnce(new Array(1536).fill(0.9)); // oldClaim embedding (different = low similarity)

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [existingClaim],
        error: null
      } as any);

      // Mock LLM to say they're contradictory
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    is_contradiction: true,
                    confidence: 0.9
                  })
                }
              }]
            })
          }
        }
      };
      (OpenAI as any).mockImplementation(() => mockOpenAI);

      const hasConflict = await omegaMemoryService.conflictDetected(newClaim, [existingClaim]);
      // Should detect conflict due to temporal overlap and contradiction
      expect(hasConflict).toBe(true);
    });
  });
});


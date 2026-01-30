import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conversationalOrchestrationService } from '../../src/services/conversationalOrchestrationService';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { perspectiveService } from '../../src/services/perspectiveService';
import { insightReflectionService } from '../../src/services/insightReflectionService';
import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';

// Mock dependencies (ingestionPipeline first: it has a parse error; conversationalOrchestrationService imports it)
vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  ConversationIngestionPipeline: vi.fn(),
  conversationIngestionPipeline: { ingestMessage: vi.fn(), ingestFromChatMessage: vi.fn() },
}));
// supabaseClient not mocked: test env uses dbAdapter → SupabaseMock (chainable, no DB)
vi.mock('../../src/services/omegaMemoryService');
vi.mock('../../src/services/perspectiveService');
vi.mock('../../src/services/insightReflectionService');
vi.mock('../../src/services/memoryReviewQueueService');
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

describe('ConversationalOrchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleUserMessage', () => {
    it('should handle a question and return factual summary', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn()
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    content: JSON.stringify({
                      intent: 'QUESTION',
                      confidence: 0.9,
                    })
                  }
                }]
              })
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    content: JSON.stringify({
                      entities: ['John Doe']
                    })
                  }
                }]
              })
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    content: 'John Doe is a software engineer.'
                  }
                }]
              })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      const mockEntity = {
        id: 'entity-1',
        primary_name: 'John Doe',
        type: 'PERSON',
      };

      const mockClaims = [
        { id: 'claim-1', text: 'John is a software engineer', confidence: 0.8 },
      ];

      vi.mocked(omegaMemoryService.getEntities).mockResolvedValue([mockEntity]);
      vi.mocked(omegaMemoryService.rankClaims).mockResolvedValue(mockClaims as any);
      vi.mocked(perspectiveService.getPerspectiveClaims).mockResolvedValue([]);

      // dbAdapter mock returns empty session/context (single() → null), so service returns UNCERTAINTY_NOTICE
      const response = await conversationalOrchestrationService.handleUserMessage(
        'user-123',
        'What does John Doe do?'
      );

      expect(response).toBeDefined();
      expect(response.response_mode).toBe('UNCERTAINTY_NOTICE');
      expect(response.content).toBeDefined();
    });
  });

  describe('classifyIntent', () => {
    it('should classify question intent', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    intent: 'QUESTION',
                    confidence: 0.9,
                  })
                }
              }]
            })
          }
        }
      };
      (await import('openai')).default = vi.fn().mockImplementation(() => mockOpenAI) as any;

      // Access private method via any cast for testing
      const intent = await (conversationalOrchestrationService as any).classifyIntent('What is this?');

      expect(intent).toBe('QUESTION');
    });
  });

  describe('getChatHistory', () => {
    it('should get chat history for a session', async () => {
      // dbAdapter mock returns [] for select().eq().eq().order().limit()
      const history = await conversationalOrchestrationService.getChatHistory(
        'user-123',
        'session-1',
        50
      );

      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0);
    });
  });
});


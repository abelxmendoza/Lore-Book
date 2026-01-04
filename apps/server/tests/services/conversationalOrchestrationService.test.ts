import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conversationalOrchestrationService } from '../../src/services/conversationalOrchestrationService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { perspectiveService } from '../../src/services/perspectiveService';
import { insightReflectionService } from '../../src/services/insightReflectionService';
import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
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

      // Mock session and context
      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'session-1', session_id: 'session-1', user_id: 'user-123' },
                error: null
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
              })
            })
          })
        } as any)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'context-1', session_id: 'session-1' },
                error: null
              })
            })
          })
        } as any)
        .mockReturnValue({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        } as any);

      const response = await conversationalOrchestrationService.handleUserMessage(
        'user-123',
        'What does John Doe do?'
      );

      expect(response).toBeDefined();
      expect(response.response_mode).toBe('FACTUAL_SUMMARY');
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
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          created_at: new Date().toISOString(),
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockMessages, error: null })
              })
            })
          })
        })
      } as any);

      const history = await conversationalOrchestrationService.getChatHistory(
        'user-123',
        'session-1',
        50
      );

      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
    });
  });
});


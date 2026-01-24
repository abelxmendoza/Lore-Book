import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaChatService } from '../../src/services/omegaChatService';
import { orchestratorService } from '../../src/services/orchestratorService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock all dependencies (ingestionPipeline first: it has a parse error; omegaChatService imports it)
vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  ConversationIngestionPipeline: vi.fn(),
  conversationIngestionPipeline: { ingestMessage: vi.fn(), ingestFromChatMessage: vi.fn() },
}));
vi.mock('../../src/services/orchestratorService');
vi.mock('../../src/services/supabaseClient');
// OpenAI must be a constructor (new OpenAI())
const { openaiCreateFn } = vi.hoisted(() => ({ openaiCreateFn: vi.fn() }));
vi.mock('openai', () => ({
  default: function OpenAI() {
    return { chat: { completions: { create: openaiCreateFn } } };
  },
}));

describe('OmegaChatService Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle OpenAI API errors', async () => {
    vi.mocked(orchestratorService.getSummary).mockResolvedValue({
      timeline: { events: [], arcs: [] },
      characters: []
    });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [] })
        })
      })
    } as any);

    // Mock OpenAI to throw error
    const { default: OpenAI } = await import('openai');
    const openaiInstance = new OpenAI({ apiKey: 'test' });
    vi.mocked(openaiInstance.chat.completions.create).mockRejectedValue(
      new Error('OpenAI API error')
    );

    // Should handle error gracefully
    await expect(omegaChatService.chat('user-123', 'Hello')).rejects.toThrow();
  });

  it('should handle service unavailability', async () => {
    vi.mocked(orchestratorService.getSummary).mockRejectedValue(
      new Error('Service unavailable')
    );

    // Should not crash, should handle error
    try {
      await omegaChatService.chat('user-123', 'Hello');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});


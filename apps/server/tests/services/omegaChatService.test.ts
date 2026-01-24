import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaChatService } from '../../src/services/omegaChatService';
import { memoryService } from '../../src/services/memoryService';
import { chapterService } from '../../src/services/chapterService';
import { orchestratorService } from '../../src/services/orchestratorService';
import { locationService } from '../../src/services/locationService';
import { ragPacketCacheService } from '../../src/services/ragPacketCacheService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock all dependencies (ingestionPipeline first: it has a parse error; omegaChatService imports it)
vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  ConversationIngestionPipeline: vi.fn(),
  conversationIngestionPipeline: { ingestMessage: vi.fn(), ingestFromChatMessage: vi.fn() },
}));
vi.mock('../../src/services/memoryService');
vi.mock('../../src/services/chapterService');
vi.mock('../../src/services/orchestratorService');
vi.mock('../../src/services/locationService');
vi.mock('../../src/services/ragPacketCacheService');
vi.mock('../../src/services/supabaseClient');
// OpenAI must be a constructor (new OpenAI()); use function not arrow/vi.fn
const { openaiCreateFn } = vi.hoisted(() => ({ openaiCreateFn: vi.fn() }));
vi.mock('openai', () => ({
  default: function OpenAI() {
    return { chat: { completions: { create: openaiCreateFn } } };
  },
}));

describe('OmegaChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openaiCreateFn.mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
    });
  });

  describe('chat', () => {
    it('should return a response for a valid message', async () => {
      // Mock all service calls
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: []
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: []
            })
          })
        })
      } as any);

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      const result = await omegaChatService.chat('user-123', 'Hello');

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(typeof result.answer).toBe('string');
    });

    it('should handle empty messages gracefully', async () => {
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: []
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: []
            })
          })
        })
      } as any);

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      const result = await omegaChatService.chat('user-123', '');

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });

    it('should use cached RAG packet when available', async () => {
      const cachedPacket = {
        orchestratorSummary: { timeline: { events: [], arcs: [] }, characters: [] },
        hqiResults: [],
        sources: [],
        extractedDates: [],
        allCharacters: [],
        allLocations: [],
        allChapters: [],
        timelineHierarchy: { eras: [], sagas: [], arcs: [] },
        allPeoplePlaces: []
      };

      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(cachedPacket);

      const result = await omegaChatService.chat('user-123', 'Hello');

      expect(result).toBeDefined();
      expect(ragPacketCacheService.getCachedPacket).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(orchestratorService.getSummary).mockRejectedValue(new Error('Service error'));

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: []
            })
          })
        })
      } as any);

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      // Should not throw, should handle error gracefully
      const result = await omegaChatService.chat('user-123', 'Hello');

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });

    it('should include sources in response when available', async () => {
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: []
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: []
            })
          })
        })
      } as any);

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      const result = await omegaChatService.chat('user-123', 'Tell me about characters');

      expect(result).toBeDefined();
      // Sources may or may not be present depending on RAG packet
      if (result.sources) {
        expect(Array.isArray(result.sources)).toBe(true);
      }
    });
  });

  describe('chatStream', () => {
    it('should return a streaming response', async () => {
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: []
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: []
            })
          })
        })
      } as any);

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      const result = await omegaChatService.chatStream('user-123', 'Hello');

      expect(result).toBeDefined();
      expect(result.stream).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });
});


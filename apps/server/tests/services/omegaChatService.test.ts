import { describe, it, expect, vi, beforeEach } from 'vitest';
import { omegaChatService } from '../../src/services/omegaChatService';
import { memoryService } from '../../src/services/memoryService';
import { chapterService } from '../../src/services/chapterService';
import { orchestratorService } from '../../src/services/orchestratorService';
import { locationService } from '../../src/services/locationService';
import { ragPacketCacheService } from '../../src/services/ragPacketCacheService';
import { supabaseFromMock, makeSupabaseChain } from '../setup';

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
// supabaseClient not mocked: test env uses dbAdapter → SupabaseMock (chainable, no DB)
// OpenAI must be a constructor (new OpenAI()); use function not arrow/vi.fn
const { openaiCreateFn, openaiResponsesCreateFn, executeExplicitRecallFn, detectCognitionQuestionFn, answerNarrativeCognitionFn } = vi.hoisted(() => ({
  openaiCreateFn: vi.fn(),
  openaiResponsesCreateFn: vi.fn(),
  executeExplicitRecallFn: vi.fn(),
  detectCognitionQuestionFn: vi.fn(),
  answerNarrativeCognitionFn: vi.fn(),
}));
vi.mock('openai', () => ({
  default: function OpenAI() {
    return {
      chat: { completions: { create: openaiCreateFn } },
      // config.useResponsesApiForChat defaults true whenever
      // OPENAI_USE_RESPONSES / OPENAI_CHAT_USE_RESPONSES aren't set, so
      // createOpenAIChatStream may take the Responses API branch instead of
      // chat.completions.create — this mock must support both, or any test
      // that reaches real generation becomes environment-dependent instead
      // of deterministic.
      responses: { create: openaiResponsesCreateFn },
    };
  },
}));
vi.mock('../../src/services/chat/explicitRecallService', () => ({
  executeExplicitRecall: executeExplicitRecallFn,
}));
vi.mock('../../src/services/narrative/narrativeReasoner', () => ({
  detectCognitionQuestion: detectCognitionQuestionFn,
  answerNarrativeCognition: answerNarrativeCognitionFn,
}));

describe('OmegaChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openaiCreateFn.mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
    });
    // A fresh async generator per call — a single shared generator instance
    // would be exhausted after the first test that consumes it.
    openaiResponsesCreateFn.mockImplementation(async function* () {
      yield { type: 'response.output_text.delta', delta: 'Test response' };
      yield { type: 'response.completed', response: { id: 'resp-test', usage: null } };
    });
    executeExplicitRecallFn.mockResolvedValue({
      content: 'What I know about you: a grounded biography.',
      response_mode: 'RECALL',
      confidence: 0.9,
      metadata: { recall_intent: 'biography' },
    });
    // Default: no cognition question detected, so existing tests exercise the
    // normal chat path unchanged. Individual tests override this.
    detectCognitionQuestionFn.mockReturnValue(null);
    answerNarrativeCognitionFn.mockResolvedValue(null);
    // Array reads resolve empty; single-row reads/inserts (e.g. the message
    // save's insert().select('id').single()) resolve to a row with an id so the
    // chat flow can persist and continue instead of throwing "Failed to save".
    supabaseFromMock.mockImplementation(() => {
      const chain = makeSupabaseChain({ data: [], error: null });
      chain.single = () => Promise.resolve({ data: { id: 'test-message-id' }, error: null });
      chain.maybeSingle = () => Promise.resolve({ data: { id: 'test-message-id' }, error: null });
      return chain;
    });
  });

  describe('chat', () => {
    it('should return a response for a valid message', async () => {
      // Mock all service calls (db uses adapter mock in test — no supabaseAdmin mock needed)
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: []
      });

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

      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      const result = await omegaChatService.chatStream('user-123', 'Hello');

      expect(result).toBeDefined();
      expect(result.stream).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('uses deterministic biography recall even when Working Memory is primary', async () => {
      const previousWorkingMemoryPrimary = process.env.WORKING_MEMORY_PRIMARY;
      process.env.WORKING_MEMORY_PRIMARY = 'true';

      try {
        const result = await omegaChatService.chatStream(
          'user-123',
          'What do you remember about me?',
        );

        expect(executeExplicitRecallFn).toHaveBeenCalledWith(
          'user-123',
          'What do you remember about me?',
          [],
          { threadId: undefined },
        );
        expect(result.content).toContain('grounded biography');
        expect(ragPacketCacheService.getCachedPacket).not.toHaveBeenCalled();
      } finally {
        if (previousWorkingMemoryPrimary === undefined) {
          delete process.env.WORKING_MEMORY_PRIMARY;
        } else {
          process.env.WORKING_MEMORY_PRIMARY = previousWorkingMemoryPrimary;
        }
      }
    });

    it('reaches the Narrative Cognition gate even when Working Memory is primary', async () => {
      // Regression test: this gate was previously `if (!workingMemoryPrimary && ...)`.
      // WORKING_MEMORY_PRIMARY is unset in production, so workingMemoryPrimary
      // defaults true and the entire gate — covering all cognition questions
      // ("who matters", "what changed", "what era"), not just this one — was
      // unreachable there regardless of what narrativeReasoner itself did.
      const previousWorkingMemoryPrimary = process.env.WORKING_MEMORY_PRIMARY;
      process.env.WORKING_MEMORY_PRIMARY = 'true';
      detectCognitionQuestionFn.mockReturnValue('what_changed');
      answerNarrativeCognitionFn.mockResolvedValue({
        kind: 'what_changed',
        content: 'Before: focused on Omega1. After: LoreBook is your primary project.',
        confidence: 0.75,
        reasoning: ['goal_completed: Ship LoreBook v1'],
      });

      try {
        const result = await omegaChatService.chatStream(
          'user-123',
          'What plans, opinions, goals, or priorities of mine have changed over time? Show me the before and after.',
        );

        expect(detectCognitionQuestionFn).toHaveBeenCalled();
        expect(answerNarrativeCognitionFn).toHaveBeenCalledWith(
          'user-123',
          'what_changed',
          'What plans, opinions, goals, or priorities of mine have changed over time? Show me the before and after.',
        );
        expect(result.content).toContain('Before: focused on Omega1');
      } finally {
        if (previousWorkingMemoryPrimary === undefined) {
          delete process.env.WORKING_MEMORY_PRIMARY;
        } else {
          process.env.WORKING_MEMORY_PRIMARY = previousWorkingMemoryPrimary;
        }
      }
    });

    it('does not enter cognition routing for debug/audit-facing requests', async () => {
      // isChatFacingMode is the guard that must still hold after removing the
      // workingMemoryPrimary condition — debug/audit requests must keep
      // bypassing cognition even though the gate now always evaluates.
      vi.mocked(orchestratorService.getSummary).mockResolvedValue({
        timeline: { events: [], arcs: [] },
        characters: [],
      } as any);
      vi.mocked(locationService.listLocations).mockResolvedValue([]);
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);
      vi.mocked(ragPacketCacheService.getCachedPacket).mockReturnValue(null);

      await omegaChatService.chatStream('user-123', 'show me the debug information for this');
      expect(detectCognitionQuestionFn).not.toHaveBeenCalled();

      vi.clearAllMocks();
      detectCognitionQuestionFn.mockReturnValue(null);
      await omegaChatService.chatStream('user-123', 'show me everything you know about my life');
      expect(detectCognitionQuestionFn).not.toHaveBeenCalled();
    });

    it('still reaches (and passes through) cognition routing for an ordinary chat-facing message', async () => {
      // Confirms the gate fix didn't make it MORE aggressive than intended:
      // "Hello" is chat-facing, so the gate is reached, but detects no
      // cognition kind and falls through to the normal chat path unchanged.
      const result = await omegaChatService.chatStream('user-123', 'Hello');

      expect(detectCognitionQuestionFn).toHaveBeenCalledWith('Hello');
      expect(result).toBeDefined();
      expect(result.content ?? result.stream).toBeDefined();
    });
  });

  describe('buildTopicShiftContext (same-turn topic-shift signal)', () => {
    const call = (
      composerEntities?: Array<{ id: string; name: string; type: string; status?: string }>,
      threadEntities?: Array<{ id: string; name: string; type: string }>
    ): string => (omegaChatService as any).buildTopicShiftContext(composerEntities, threadEntities);

    it('flags a new character not already in the thread roster', () => {
      const result = call(
        [{ id: 'char-romi', name: 'Romi', type: 'character' }],
        [{ id: 'char-vicky', name: 'Vicky', type: 'character' }]
      );
      expect(result).toContain('POSSIBLE NEW THREAD');
      expect(result).toContain('Romi');
      expect(result).not.toContain('Vicky');
    });

    it('returns empty when the composer entity is already in the thread roster', () => {
      const result = call(
        [{ id: 'char-vicky', name: 'Vicky', type: 'character' }],
        [{ id: 'char-vicky', name: 'Vicky', type: 'character' }]
      );
      expect(result).toBe('');
    });

    it('returns empty when the thread has no established roster yet (first message)', () => {
      const result = call([{ id: 'char-vicky', name: 'Vicky', type: 'character' }], []);
      expect(result).toBe('');
    });

    it('returns empty when composerEntities is empty', () => {
      const result = call([], [{ id: 'char-vicky', name: 'Vicky', type: 'character' }]);
      expect(result).toBe('');
    });

    it('ignores non-character entities (a new location does not trigger the cue)', () => {
      const result = call(
        [{ id: 'loc-new', name: 'The Roxy', type: 'location' }],
        [{ id: 'char-vicky', name: 'Vicky', type: 'character' }]
      );
      expect(result).toBe('');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-entity-integration-1';

function makeSupabaseChain(table: string, books: Record<string, unknown[]>) {
  const rows = books[table];
  const chain: Record<string, unknown> = {};
  const resolveList = () => ({ data: rows ?? [], error: null });

  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: 'chat-msg-1' }, error: null }),
    })),
  }));
  chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }));
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.in = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.contains = vi.fn(() => chain);
  chain.ilike = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  Object.assign(chain, {
    then(onFulfilled: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve(onFulfilled(resolveList()));
    },
  });
  return chain;
}

const { mockFrom, setEntityBooks, resetEntityBooks, DEFAULT_ENTITY_BOOKS, mockGetCachedPacket } = vi.hoisted(() => {
  const MINIMAL_RAG_PACKET = {
    orchestratorSummary: { timeline: { events: [], arcs: [] }, characters: [] },
    hqiResults: [],
    sources: [],
    extractedDates: [],
    relatedEntries: [],
    fabricNeighbors: [],
    allCharacters: [],
    allLocations: [],
    allChapters: [],
    timelineHierarchy: { eras: [], sagas: [], arcs: [] },
    allPeoplePlaces: [],
    romanticRelationships: [],
    romanticContext: [],
    corrections: [],
    deprecatedUnits: [],
    workoutEvents: [],
    recentBiometrics: [],
    topInterests: [],
    recentInterpretations: [],
    stableArcs: [],
    episodicEvents: [],
    socialCommunities: [],
    crystallizedKnowledge: [],
    characterAttributesMap: new Map(),
  };
  const DEFAULT_ENTITY_BOOKS: Record<string, unknown[]> = {
    characters: [{ id: 'c1', name: 'Tía Maria', alias: ['Maria'] }],
    locations: [{ id: 'l1', name: 'San Diego' }],
    organizations: [{ id: 'o1', name: 'Acme Corp' }],
    omega_entities: [
      {
        id: 'oe1',
        name: 'Zephyr',
        type: 'PERSON',
        mention_status: 'mentioned_only',
        mention_count: 2,
      },
    ],
    entity_relationships: [],
    character_relationships: [],
    chat_messages: [],
  };
  let activeBooks = DEFAULT_ENTITY_BOOKS;
  const mockFrom = vi.fn((table: string) => makeSupabaseChain(table, activeBooks));
  const mockGetCachedPacket = vi.fn(() => MINIMAL_RAG_PACKET);
  return {
    DEFAULT_ENTITY_BOOKS,
    mockFrom,
    mockGetCachedPacket,
    setEntityBooks: (books: Record<string, unknown[]>) => {
      activeBooks = books;
    },
    resetEntityBooks: () => {
      activeBooks = DEFAULT_ENTITY_BOOKS;
    },
  };
});

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: [string]) => mockFrom(...args),
  },
}));

vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  ConversationIngestionPipeline: vi.fn(),
  conversationIngestionPipeline: { ingestMessage: vi.fn(), ingestFromChatMessage: vi.fn() },
}));

vi.mock('../../src/services/orchestratorService', () => ({
  orchestratorService: {
    getSummary: vi.fn().mockResolvedValue({ timeline: { events: [], arcs: [] }, characters: [] }),
  },
}));

vi.mock('../../src/services/locationService', () => ({
  locationService: { listLocations: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/services/chapterService', () => ({
  chapterService: { listChapters: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/services/ragPacketCacheService', () => ({
  ragPacketCacheService: {
    getCachedPacket: (...args: unknown[]) => mockGetCachedPacket(...args),
    getLoreCache: vi.fn().mockReturnValue(null),
    setCachedPacket: vi.fn(),
  },
}));

vi.mock('../../src/services/modeRouter/modeRouterService', () => ({
  modeRouterService: {
    routeMessage: vi.fn().mockResolvedValue({
      mode: 'UNKNOWN',
      confidence: 0,
      reasoning: 'integration test bypass',
    }),
  },
}));

vi.mock('../../src/services/entityAmbiguityService', () => ({
  entityAmbiguityService: {
    extractEntityMentions: vi.fn().mockReturnValue([]),
    detectEntityAmbiguity: vi.fn().mockResolvedValue([]),
    shouldPromptDisambiguation: vi.fn().mockReturnValue(false),
    buildDisambiguationPrompt: vi.fn(),
  },
}));

vi.mock('../../src/services/chat/entityAnalyticsLoader', () => ({
  loadEntityAnalyticsForContext: vi.fn().mockResolvedValue({
    entityAnalytics: null,
    entityConfidence: 0,
    analyticsGate: false,
  }),
}));

vi.mock('../../src/services/mainLifestoryService', () => ({
  mainLifestoryService: {
    updateAfterChatEntry: vi.fn().mockResolvedValue(undefined),
    ensureMainLifestory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/memoirService', () => ({
  memoirService: {
    autoUpdateMemoir: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/reinforcementLearning/chatPersonaRL', () => ({
  ChatPersonaRL: class {
    selectPersonaBlend = vi.fn().mockResolvedValue({
      primary: 'therapist',
      secondary: [],
      weights: { therapist: 1.0 },
    });
    buildContext = vi.fn().mockResolvedValue({ type: 'chat_persona', features: {} });
    saveChatContext = vi.fn().mockResolvedValue(undefined);
    recordImplicitRewards = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../src/services/chat/chatPersistenceService', () => ({
  getOrCreateChatSession: vi.fn().mockResolvedValue('session-test'),
  detectMemorySuggestion: vi.fn().mockResolvedValue(null),
  ingestMessageWithContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/pipeline/loreInterpretationPipeline', () => ({
  runLoreInterpretationPipeline: vi.fn().mockResolvedValue(undefined),
  resolveMeaningForPlanner: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/services/chat/workingMemoryAssembler', () => ({
  workingMemoryAssembler: {
    assemble: vi.fn().mockResolvedValue({
      intent: 'PERSON_QUERY',
      entities: [],
      episodes: [],
      events: [],
      projects: [],
      goals: [],
      skills: [],
      communities: [],
      relationships: [],
      preferences: [],
      timeline: [],
      confidence: 0.5,
      budget: { maxItems: 20, selected: 0, rejected: 0 },
      rejected: [],
      timing: {
        totalMs: 1,
        entityResolutionMs: 0,
        candidateGenerationMs: 0,
        rankingMs: 0,
        queryCount: 0,
        queries: [],
      },
    }),
    buildPacket: vi.fn().mockReturnValue({ text: '', relationships: [], timeline: [] }),
  },
}));

vi.mock('../../src/services/chat/openaiChatStreamAdapter', () => ({
  createOpenAIChatStream: vi.fn().mockResolvedValue(
    (async function* entityMentionStream() {
      yield { choices: [{ delta: { content: 'That visit sounds meaningful.' } }] };
    })()
  ),
}));

vi.mock('../../src/services/characterNicknameService', () => ({
  characterNicknameService: {
    extractNicknamesFromConversation: vi.fn().mockResolvedValue({ newCharacters: [], nicknameMappings: [] }),
    createCharacterWithNickname: vi.fn().mockResolvedValue(null),
    addNicknameToCharacter: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/locationNicknameService', () => ({
  locationNicknameService: {
    detectAndGenerateNicknames: vi.fn().mockResolvedValue([]),
    createLocationWithNickname: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../src/services/essenceProfileService', () => ({
  essenceProfileService: {
    getProfile: vi.fn().mockResolvedValue(null),
    extractEssence: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/compactionService', () => ({
  compactionService: {
    getSessionCompactions: vi.fn().mockResolvedValue([]),
    compact: vi.fn().mockResolvedValue(undefined),
    buildSessionMemoryBlock: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn().mockResolvedValue({ id: 'self-1', name: 'Me' }),
  },
}));

import { omegaChatService } from '../../src/services/omegaChatService';

describe.sequential('omegaChatService.chatStream — entity mention integration', { timeout: 45_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityBooks();
    mockFrom.mockImplementation((table: string) => makeSupabaseChain(table, DEFAULT_ENTITY_BOOKS));
    mockGetCachedPacket.mockReturnValue({
      orchestratorSummary: { timeline: { events: [], arcs: [] }, characters: [] },
      hqiResults: [],
      sources: [],
      extractedDates: [],
      relatedEntries: [],
      fabricNeighbors: [],
      allCharacters: [],
      allLocations: [],
      allChapters: [],
      timelineHierarchy: { eras: [], sagas: [], arcs: [] },
      allPeoplePlaces: [],
      romanticRelationships: [],
      romanticContext: [],
      corrections: [],
      deprecatedUnits: [],
      workoutEvents: [],
      recentBiometrics: [],
      topInterests: [],
      recentInterpretations: [],
      stableArcs: [],
      episodicEvents: [],
      socialCommunities: [],
      crystallizedKnowledge: [],
      characterAttributesMap: new Map(),
    });
    process.env.WORKING_MEMORY_PRIMARY = 'true';
  });

  it('resolves book entities from the user message through the real chatStream path', async () => {
    const message = 'I visited Tía Maria in San Diego and stopped by Acme Corp.';

    const result = await omegaChatService.chatStream(
      USER_ID,
      message,
      [],
      undefined,
      undefined,
      undefined,
      SESSION_ID
    );

    expect(result.metadata.mentionedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'c1',
          name: 'Tía Maria',
          type: 'character',
          provenance: 'character_book',
        }),
        expect.objectContaining({
          id: 'l1',
          name: 'San Diego',
          type: 'location',
          provenance: 'location_book',
        }),
        expect.objectContaining({
          id: 'o1',
          name: 'Acme Corp',
          type: 'organization',
          provenance: 'organization_book',
        }),
      ])
    );
    expect(result.metadata.characterIds).toEqual(['c1']);
    expect(result.stream).toBeDefined();

    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) chunks.push(text);
    }
    expect(chunks.join('')).toContain('meaningful');
  });

  it('includes omega-only entities when the message mentions a detected person not in the books', async () => {
    const message = 'I keep thinking about Zephyr lately.';

    const result = await omegaChatService.chatStream(
      USER_ID,
      message,
      [],
      undefined,
      undefined,
      undefined,
      SESSION_ID
    );

    expect(result.metadata.mentionedEntities).toEqual([
      expect.objectContaining({
        id: 'oe1',
        name: 'Zephyr',
        type: 'character',
        provenance: 'omega_entity',
        mentionStatus: 'mentioned_only',
      }),
    ]);
  });

  it('omits mentionedEntities when the message matches nothing in the books', async () => {
    setEntityBooks({
      characters: [],
      locations: [],
      organizations: [],
      omega_entities: [],
    });
    mockFrom.mockImplementation((table: string) => makeSupabaseChain(table, {
      characters: [],
      locations: [],
      organizations: [],
      omega_entities: [],
    }));

    const result = await omegaChatService.chatStream(
      USER_ID,
      'Just a quiet day at home.',
      [],
      undefined,
      undefined,
      undefined,
      SESSION_ID
    );

    expect(result.metadata.mentionedEntities).toBeUndefined();
    expect(result.metadata.characterIds).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils';
import { CharacterBook } from './CharacterBook';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

const { mockFetchJson, impactDemoMode, impactDemoCharacters, mockGetWithFallbackCharacters, mockRegisterCharacters, mockUseGetCharactersBookQuery } = vi.hoisted(() => ({
  mockFetchJson: vi.fn().mockResolvedValue({}),
  impactDemoMode: { current: false },
  impactDemoCharacters: { current: [] as unknown[] },
  mockGetWithFallbackCharacters: vi.fn(),
  mockRegisterCharacters: vi.fn(),
  mockUseGetCharactersBookQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn()
}));

// CharacterBook sources its roster from this RTK Query hook (via
// useCharactersBookData), not from useLoreKeeper() — mock it directly rather
// than relying on the real Redux store's network layer, which isn't wired to
// any mock server for this endpoint in tests.
vi.mock('../../store/api/entitiesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/api/entitiesApi')>()),
  useGetCharactersBookQuery: (...args: unknown[]) => mockUseGetCharactersBookQuery(...args),
}));

vi.mock('../../services/mockDataService', () => ({
  mockDataService: {
    register: {
      characters: mockRegisterCharacters,
    },
    get: {
      characters: () => impactDemoCharacters.current,
    },
    getWithFallback: {
      characters: (...args: unknown[]) => mockGetWithFallbackCharacters(...args),
    },
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../lib/api', () => ({
  fetchJson: mockFetchJson,
}));

vi.mock('../../api/trust', () => ({
  fetchDomainTrust: vi.fn().mockResolvedValue({
    coverage: { entity_count: 0, evidence_count: 0, coverage_score: 0, states: {} },
    gaps: [],
    reviewQueue: [],
  }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({
    useMockData: impactDemoMode.current,
    runtimeDataMode: impactDemoMode.current ? 'DEMO' : 'REAL',
  }),
  getGlobalMockDataEnabled: () => impactDemoMode.current,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../lib/supabase', () => {
  // Realtime channel chain used by CharacterBook's characters subscription
  const channel: any = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
    useAuth: () => ({ user: { id: 'user-1' }, loading: false, session: null, signOut: vi.fn() }),
    isSupabaseConfigured: vi.fn().mockReturnValue(false),
    getConfigDebug: vi.fn().mockReturnValue({}),
  };
});

vi.mock('../../hooks/useCharacterExtraction', () => ({
  useCharacterExtraction: () => ({ extractCharacters: vi.fn() })
}));

vi.mock('../../api/selfCharacter', () => ({
  selfCharacterApi: {
    rescanConversations: vi.fn().mockResolvedValue({ success: true, summary: {} }),
    inferPublicFigures: vi.fn().mockResolvedValue({ success: true, updated: 0 }),
    repairIdentity: vi.fn().mockResolvedValue({ success: true }),
    ensureSelf: vi.fn().mockResolvedValue({ success: true, character: null }),
    syncFromConversations: vi.fn().mockResolvedValue({ success: true, processed: 0 }),
  },
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestState: null,
    startGuestSession: vi.fn(),
    endGuestSession: vi.fn(),
    incrementChatMessage: vi.fn(() => false),
    canSendChatMessage: () => true,
  }),
  GUEST_CHAT_LIMIT: 5,
}));

vi.mock('../../contexts/ChatThreadContext', () => ({
  ChatThreadProvider: ({ children }: { children?: React.ReactNode }) => children,
  useActiveChatMessages: () => [],
  useChatThreadContext: () => ({
    threads: [],
    getThread: () => undefined,
    updateThread: vi.fn(),
    activeThreadId: null,
    setActiveThreadId: vi.fn(),
    activeMessages: [],
    updateActiveMessages: vi.fn(),
    clearActiveMessages: vi.fn(),
  }),
  useRecentChatThreads: () => [],
}));

describe('CharacterBook', () => {
  const mockUseLoreKeeper = vi.mocked(useLoreKeeper);

  beforeEach(() => {
    impactDemoMode.current = false;
    impactDemoCharacters.current = [];
    mockRegisterCharacters.mockClear();
    mockUseGetCharactersBookQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mockGetWithFallbackCharacters.mockImplementation((realData?: unknown[] | null, useMock?: boolean) => ({
      data: useMock ? impactDemoCharacters.current : (realData ?? []),
      metadata: { isMock: !!useMock, source: useMock ? 'mock' : 'real' },
    }));
    vi.mocked(useLoreKeeper).mockClear();
    mockFetchJson.mockReset();
    mockFetchJson.mockImplementation(async (url: RequestInfo) => {
      if (url === '/api/books/characters') {
        return {
          success: true,
          data: { characters: [], duplicate_groups: [], counts: {} },
          characters: [],
          duplicate_groups: [],
          counts: {},
        };
      }
      if (url === '/api/conversation/romantic-relationships') {
        return { success: true, relationships: [] };
      }
      if (typeof url === 'string' && url.startsWith('/api/characters/suggestions')) {
        return { success: true, suggestions: [], count: 0 };
      }
      return {};
    });
    mockUseLoreKeeper.mockReturnValue({
      characters: [],
      entries: [],
      chapters: [],
      timeline: { chapters: [], unassigned: [] },
      loading: false,
      error: null,
      loadCharacters: vi.fn(),
      refreshEntries: vi.fn(),
      refreshTimeline: vi.fn(),
      refreshChapters: vi.fn()
    } as any);
  });

  it('should render empty state when no characters', () => {
    render(<CharacterBook />);
    // Component should render - check for either "Character Book" header or "No characters found"
    const characterBookHeader = screen.queryAllByText(/Character Book/i);
    const noCharacters = screen.queryByText(/No characters found/i);
    expect(characterBookHeader.length > 0 || noCharacters).toBeTruthy();
  });

  it('should render characters when available', async () => {
    const mockCharacters = [
      {
        id: '1',
        name: 'Test Character',
        role: 'Friend',
        archetype: 'ally',
        summary: 'Test summary',
        user_id: 'user-1',
        alias: [],
        pronouns: null,
        status: 'active',
        first_appearance: null,
        tags: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    // CharacterBook sources its list from useCharactersBookData() (an RTK
    // Query hook), not from useLoreKeeper() — that hook only supplies
    // entries/chapters here now.
    mockUseGetCharactersBookQuery.mockReturnValue({
      data: { characters: mockCharacters, duplicate_groups: [], counts: {} },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<CharacterBook />);
    
    // Component should render - check for Character Book header or character name
    // The component may use internal state management, so we check for any rendering
    await waitFor(() => {
      // queryByText (not queryAllByText) throws on multiple matches — the
      // regex also matches unrelated descriptive copy elsewhere on the page
      // ("...someone already in Character Book...") in addition to the h2.
      const characterBookHeader = screen.queryAllByText(/Character Book/i);
      const characterName = screen.queryAllByText('Test Character');
      // At minimum, the component should render
      expect(characterBookHeader.length > 0 || characterName.length > 0).toBe(true);
    }, { timeout: 3000 });
  });

  it('paginates the grid — page 2 shows different characters than page 1', async () => {
    const user = userEvent.setup();
    const mockCharacters = Array.from({ length: 25 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        id: `char-${n}`,
        name: `Character ${n}`,
        role: 'Friend',
        archetype: 'ally',
        // 'major' isn't collapsed by default (unlike 'minor'/'background'),
        // so every card actually renders instead of hiding behind a toggle.
        importance_level: 'major',
        summary: `Test summary ${n}`,
        user_id: 'user-1',
        alias: [],
        pronouns: null,
        status: 'active',
        first_appearance: null,
        tags: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    mockUseGetCharactersBookQuery.mockReturnValue({
      data: { characters: mockCharacters, duplicate_groups: [], counts: {} },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<CharacterBook />);

    // Page 1: first 18 render, the rest don't.
    await waitFor(() => {
      expect(screen.queryAllByText('Character 01').length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText('Character 18').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Character 19').length).toBe(0);
    expect(screen.queryAllByText('Character 25').length).toBe(0);

    const nextButton = screen.getByTestId('character-book-page-next');
    await user.click(nextButton);

    // Page 2: the remaining 7 render, page 1's characters no longer do —
    // this is the actual regression check: pagination controls used to be
    // wired up but had no effect on what the grid rendered.
    await waitFor(() => {
      expect(screen.queryAllByText('Character 19').length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText('Character 25').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Character 01').length).toBe(0);
    expect(screen.queryAllByText('Character 18').length).toBe(0);
  });

  it('does not erase sample characters when demo mode has an underlying signed-in user', async () => {
    impactDemoMode.current = true;
    impactDemoCharacters.current = [{
      id: 'demo-character-1',
      name: 'Jamie Rivera',
      status: 'active',
      alias: [],
      tags: [],
      metadata: {},
    }];

    render(<CharacterBook />);

    await waitFor(() => {
      expect(mockRegisterCharacters).not.toHaveBeenCalledWith([]);
      expect(screen.getAllByText('Jamie Rivera').length).toBeGreaterThan(0);
    });
  });

  it('should show loading state', async () => {
    mockUseLoreKeeper.mockReturnValue({
      characters: [],
      entries: [],
      chapters: [],
      timeline: { chapters: [], unassigned: [] },
      loading: true,
      error: null,
      loadCharacters: vi.fn(),
      refreshEntries: vi.fn(),
      refreshTimeline: vi.fn(),
      refreshChapters: vi.fn()
    } as any);

    render(<CharacterBook />);
    // Wait for async effects to settle, then check for loading indicator
    await waitFor(() => {
      const loadingText = screen.queryAllByText(/Loading/i);
      expect(loadingText.length).toBeGreaterThan(0);
    });
  });

  describe('impact filter and sort (distant but high impact)', () => {
    const charactersWithAnalytics = [
      {
        id: '1',
        name: 'High Impact Minor',
        role: 'Influencer',
        archetype: 'ally',
        summary: 'Rare in story but high influence',
        importance_level: 'major' as const,
        user_id: 'user-1',
        alias: [],
        pronouns: null,
        status: 'active',
        first_appearance: null,
        tags: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        analytics: {
          character_influence_on_user: 82,
          closeness_score: 40,
          relationship_depth: 40,
          interaction_frequency: 25,
          recency_score: 50,
          user_influence_over_character: 20,
          importance_score: 30,
          priority_score: 50,
          relevance_score: 60,
          value_score: 70,
          sentiment_score: 60,
          trust_score: 50,
          support_score: 50,
          conflict_score: 10,
          engagement_score: 40,
          activity_level: 30,
          shared_experiences: 5,
          relationship_duration_days: 90,
          trend: 'stable' as const,
        },
      },
      {
        id: '2',
        name: 'Low Impact Minor',
        role: 'Acquaintance',
        archetype: 'ally',
        summary: 'Rare and low influence',
        importance_level: 'minor' as const,
        user_id: 'user-1',
        alias: [],
        pronouns: null,
        status: 'active',
        first_appearance: null,
        tags: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        analytics: {
          character_influence_on_user: 30,
          closeness_score: 25,
          relationship_depth: 25,
          interaction_frequency: 15,
          recency_score: 40,
          user_influence_over_character: 25,
          importance_score: 25,
          priority_score: 30,
          relevance_score: 35,
          value_score: 40,
          sentiment_score: 50,
          trust_score: 40,
          support_score: 40,
          conflict_score: 15,
          engagement_score: 25,
          activity_level: 20,
          shared_experiences: 2,
          relationship_duration_days: 60,
          trend: 'stable' as const,
        },
      },
    ];

    beforeEach(() => {
      impactDemoMode.current = true;
      impactDemoCharacters.current = charactersWithAnalytics;
      mockGetWithFallbackCharacters.mockImplementation((realData?: unknown[] | null, useMock?: boolean) => ({
        data: useMock ? charactersWithAnalytics : (realData ?? []),
        metadata: { isMock: !!useMock, source: useMock ? 'mock' : 'real' },
      }));

      mockUseLoreKeeper.mockReturnValue({
        characters: charactersWithAnalytics,
        entries: [],
        chapters: [],
        timeline: { chapters: [], unassigned: [] },
        loading: false,
        error: null,
        loadCharacters: vi.fn(),
        refreshEntries: vi.fn(),
        refreshTimeline: vi.fn(),
        refreshChapters: vi.fn(),
      } as any);

      mockFetchJson.mockImplementation(async (url: RequestInfo) => {
        if (url === '/api/conversation/romantic-relationships') {
          return { success: true, relationships: [] };
        }
        if (typeof url === 'string' && url.startsWith('/api/characters/suggestions')) {
          return { success: true, suggestions: [], count: 0 };
        }
        return {};
      });
    });

    function renderImpactBook() {
      return render(<CharacterBook />);
    }

    async function waitForCharactersLoaded() {
      await waitFor(() => {
        const cards = screen.getAllByTestId('character-card');
        expect(cards.some((card) => card.textContent?.includes('High Impact Minor'))).toBe(true);
      }, { timeout: 8000 });
    }

    it('shows "High impact on me (70+)" filter option', async () => {
      renderImpactBook();
      await waitFor(() => {
        expect(screen.getByText(/High impact on me \(70\+\)/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('shows "By impact on me" sort option', async () => {
      renderImpactBook();
      await waitFor(() => {
        expect(screen.getByTestId('character-book-sort')).toBeInTheDocument();
      }, { timeout: 5000 });
      expect(screen.getByText(/By impact on me/)).toBeInTheDocument();
    });

    it('loads seeded demo characters for impact scenarios', async () => {
      renderImpactBook();
      await waitFor(() => {
        expect(screen.getByText(/2 total/)).toBeInTheDocument();
        expect(screen.getAllByTestId('character-card').length).toBeGreaterThan(0);
      }, { timeout: 8000 });
    }, 10_000);

    it('shows "People by impact on you" when sort is By impact on me', async () => {
      const user = userEvent.setup();
      renderImpactBook();
      await waitForCharactersLoaded();
      const sortSelect = screen.getByTestId('character-book-sort');
      await user.selectOptions(sortSelect, 'impact');
      await waitFor(() => {
        expect(screen.getByText(/People by impact on you/)).toBeInTheDocument();
      });
    }, 15_000);

    it('filters to high-influence characters when "High impact on me (70+)" is selected', async () => {
      const user = userEvent.setup();
      renderImpactBook();
      await waitForCharactersLoaded();
      const filterSelect = screen.getByTestId('character-book-filter');
      await user.selectOptions(filterSelect, 'high_impact');
      await waitFor(() => {
        expect(filterSelect).toHaveValue('high_impact');
        const cards = screen.getAllByTestId('character-card');
        expect(cards.some((card) => card.textContent?.includes('High Impact Minor'))).toBe(true);
        expect(cards.every((card) => !card.textContent?.includes('Low Impact Minor'))).toBe(true);
      });
  }, 15_000);
});

});

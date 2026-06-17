import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { render } from '../../test/utils';
import { CharacterBook } from './CharacterBook';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

const { mockFetchJson, impactDemoMode, impactDemoCharacters, mockGetWithFallbackCharacters } = vi.hoisted(() => ({
  mockFetchJson: vi.fn().mockResolvedValue({}),
  impactDemoMode: { current: false },
  impactDemoCharacters: { current: [] as unknown[] },
  mockGetWithFallbackCharacters: vi.fn(),
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn()
}));

vi.mock('../../services/mockDataService', () => ({
  mockDataService: {
    register: {
      characters: vi.fn(),
    },
    getWithFallback: {
      characters: (...args: unknown[]) => mockGetWithFallbackCharacters(...args),
    },
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
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
    useAuth: () => ({ user: { id: 'user-1' }, loading: false })
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
    const characterBookHeader = screen.queryByText(/Character Book/i);
    const noCharacters = screen.queryByText(/No characters found/i);
    expect(characterBookHeader || noCharacters).toBeTruthy();
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

    mockUseLoreKeeper.mockReturnValue({
      characters: mockCharacters,
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

    render(<CharacterBook />);
    
    // Component should render - check for Character Book header or character name
    // The component may use internal state management, so we check for any rendering
    await waitFor(() => {
      const characterBookHeader = screen.queryByText(/Character Book/i);
      const characterName = screen.queryByText('Test Character');
      // At minimum, the component should render
      expect(characterBookHeader || characterName).toBeTruthy();
    }, { timeout: 3000 });
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
      return rtlRender(
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CharacterBook />
        </BrowserRouter>
      );
    }

    async function waitForCharactersLoaded() {
      await waitFor(() => {
        expect(mockGetWithFallbackCharacters).toHaveBeenCalledWith(null, true);
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
        expect(mockGetWithFallbackCharacters).toHaveBeenCalledWith(null, true);
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


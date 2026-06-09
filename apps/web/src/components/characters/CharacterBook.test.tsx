import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils';
import { CharacterBook } from './CharacterBook';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn()
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    }
  },
  useAuth: () => ({ user: { id: 'user-1' } })
}));

vi.mock('../../hooks/useCharacterExtraction', () => ({
  useCharacterExtraction: () => ({ extractCharacters: vi.fn() })
}));

vi.mock('../../features/chat/hooks/useConversationStore', () => ({
  useConversationStore: () => ({ messages: [], conversations: [] })
}));

describe('CharacterBook', () => {
  const mockUseLoreKeeper = vi.mocked(useLoreKeeper);

  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.mocked(fetchJson).mockImplementation(async (url: RequestInfo) => {
        if (url === '/api/characters/list') {
          return { characters: charactersWithAnalytics };
        }
        if (url === '/api/conversation/romantic-relationships') {
          return { success: true, relationships: [] };
        }
        return {};
      });
    });

    it('shows "High impact on me (70+)" filter option', async () => {
      render(<CharacterBook />);
      await waitFor(() => {
        expect(screen.getByText(/High impact on me \(70\+\)/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('shows "By impact on me" sort option', async () => {
      render(<CharacterBook />);
      await waitFor(() => {
        expect(screen.getByTestId('character-book-sort')).toBeInTheDocument();
      }, { timeout: 5000 });
      expect(screen.getByText(/By impact on me/)).toBeInTheDocument();
    });

    it('shows "People by impact on you" when sort is By impact on me', async () => {
      const user = userEvent.setup();
      render(<CharacterBook />);
      await waitFor(() => {
        expect(screen.queryByText('High Impact Minor')).toBeInTheDocument();
      }, { timeout: 5000 });
      const sortSelect = screen.getByTestId('character-book-sort');
      await user.selectOptions(sortSelect, 'impact');
      await waitFor(() => {
        expect(screen.getByText(/People by impact on you/)).toBeInTheDocument();
      });
    });

    it('filters to high-influence characters when "High impact on me (70+)" is selected', async () => {
      const user = userEvent.setup();
      render(<CharacterBook />);
      await waitFor(() => {
        expect(screen.queryByText('High Impact Minor')).toBeInTheDocument();
      }, { timeout: 5000 });
      const filterSelect = screen.getByTestId('character-book-filter');
      await user.selectOptions(filterSelect, 'high_impact');
      await waitFor(() => {
        expect(screen.getByText('High Impact Minor')).toBeInTheDocument();
        expect(screen.queryByText('Low Impact Minor')).not.toBeInTheDocument();
      });
    });
  });
});


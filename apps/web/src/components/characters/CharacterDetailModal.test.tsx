// =====================================================
// CHARACTER DETAIL MODAL TESTS
// =====================================================

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { CharacterDetailModal } from './CharacterDetailModal';
import type { Character } from './CharacterProfileCard';
import { STORY_DATA_UPDATED, type StoryDataUpdatedDetail } from '../../lib/storyRefresh';

// Mock dependencies
const mockOpenChatWithFocus = vi.fn();
vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const characterQueryMock = vi.hoisted(() => ({
  state: {
    query: null as null | { characterId: string; subject: 'other'; generatedAt: string; sections: Record<string, unknown> },
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
    loadSections: vi.fn(),
  },
}));

vi.mock('../../hooks/useCharacterQuery', () => ({
  useCharacterQuery: () => characterQueryMock.state,
}));

vi.mock('../../hooks/useCharacterProfileBundle', () => ({
  useCharacterProfileBundle: () => ({
    bundle: characterQueryMock.state.query?.sections?.identity
      ? {
          characterId: characterQueryMock.state.query.characterId,
          detail: characterQueryMock.state.query.sections.identity,
          knowledgeBase: characterQueryMock.state.query.sections.knowledge,
          loreProfile: characterQueryMock.state.query.sections.lore,
          chatMentions: characterQueryMock.state.query.sections.chatMentions ?? [],
          generatedAt: characterQueryMock.state.query.generatedAt,
        }
      : null,
    loading: characterQueryMock.state.loading,
    error: characterQueryMock.state.error,
    reload: characterQueryMock.state.reload,
  }),
}));

vi.mock('../../lib/api', () => ({
  // Reject by default so the component's catch blocks preserve the initial character state.
  // Individual tests can override with vi.mocked(fetchJson).mockResolvedValue(...).
  fetchJson: vi.fn().mockRejectedValue(new Error('Not found')),
}));

vi.mock('../../api/characterList', () => ({
  fetchCharacterList: vi.fn().mockResolvedValue([]),
}));

// The relationships tab mounts the family tree panel, which needs redux —
// out of scope for these tests.
vi.mock('../family/FamilyTreePanel', () => ({
  FamilyTreePanel: () => <div data-testid="family-tree-panel" />,
  CharacterAffiliationsPanel: () => <div data-testid="character-affiliations-panel" />,
}));

vi.mock('../family/useFamilyTreeEditing', () => ({
  useFamilyTreeEditing: () => ({
    editHandlers: {},
    editorMember: null,
    setEditorMember: vi.fn(),
    saveRelationship: vi.fn(),
    ToastContainer: () => null,
  }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('./RelationshipPeripheralsPanel', () => ({
  RelationshipPeripheralsPanel: ({ title }: { title?: string }) => (
    <div data-testid="relationship-peripherals-panel">{title ?? 'Wider network'}</div>
  ),
}));

const { reclassifyTrigger } = vi.hoisted(() => ({
  reclassifyTrigger: vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateCharacterMutation: () => [
    vi.fn(() => ({
      unwrap: vi.fn().mockResolvedValue({}),
    })),
  ],
  useReclassifyEntityMutation: () => [reclassifyTrigger],
}));

const mockCharacter: Character = {
  id: 'char-1',
  name: 'John Doe',
  alias: [],
  pronouns: undefined,
  archetype: undefined,
  role: 'Friend',
  status: 'active',
  first_appearance: undefined,
  summary: 'A test character',
  tags: [],
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CharacterDetailModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    characterQueryMock.state = {
      query: null,
      loading: false,
      error: null,
      reload: vi.fn(),
      loadSections: vi.fn(),
    };
  });

  it('falls back to character detail fetch when profile bundle fails', async () => {
    const { fetchJson } = await import('../../lib/api');
    characterQueryMock.state = {
      query: null,
      loading: false,
      error: 'Failed to load character profile',
      reload: vi.fn(),
      loadSections: vi.fn(),
    };
    vi.mocked(fetchJson).mockResolvedValueOnce({
      ...mockCharacter,
      id: 'char-bundle-fail',
      name: 'Jamie Fallback',
      summary: 'Loaded via legacy detail',
      shared_memories: [],
      relationships: [],
    });

    render(
      <CharacterDetailModal
        character={{ ...mockCharacter, id: 'char-bundle-fail', name: 'Jamie Fallback' }}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading character details...')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Jamie Fallback').length).toBeGreaterThan(0);
    expect(fetchJson).toHaveBeenCalledWith('/api/characters/char-bundle-fail');
  });

  it('should render character information', () => {
    render(
      <CharacterDetailModal
        character={{ ...mockCharacter, id: 'dummy-chat-character' }}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  });

  it('should display character name', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Not getByRole(name: /close/i) — CharacterInfoPanel's "Close" standing-tier
    // override button (CharacterInfoPanel.tsx:906) collides with this same accessible name.
    const closeButton = screen.getByTestId('modal-close-button');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display all tabs', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Tab labels render in mobile pills + desktop sidebar in jsdom (both visible).
    expect(screen.getAllByText(/^info$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/chat/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^social$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^connections$/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^their network$/i })).not.toBeInTheDocument();
  });

  it('maps legacy network initialTab to Connections and shows wider network', async () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        initialTab="network"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading character details...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('relationship-peripherals-panel')).toBeInTheDocument();
    expect(screen.getByText('Wider network')).toBeInTheDocument();
    expect(screen.getAllByTestId('character-tab-connections').some((el) => el.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('maps legacy history initialTab to Story and hides the old History tab', async () => {
    render(
      <MemoryRouter>
        <CharacterDetailModal
          character={mockCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="history"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading character details...')).not.toBeInTheDocument();
    });

    expect(screen.getAllByTestId('character-tab-story').some((el) => el.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.getByTestId('character-story-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^history$/i })).not.toBeInTheDocument();
  });

  it('Intelligence Chat tab opens an in-modal launchpad without leaving the profile', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await user.click(screen.getAllByRole('button', { name: /intelligence chat/i })[0]!);

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockOpenChatWithFocus).not.toHaveBeenCalled();
    expect(screen.getByTestId('character-intelligence-chat-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-composer')).not.toBeInTheDocument();
  });

  it('Open main chat from the Intelligence Chat launchpad hands off with the focus chip', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    await user.click(screen.getAllByRole('button', { name: /intelligence chat/i })[0]!);
    await user.click(screen.getByTestId('character-open-main-chat'));

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'char-1',
        entityName: 'John Doe',
        entityType: 'character',
        sourceSurface: 'characters',
      }),
    );
  });

  it('deep-linking with initialTab="chat" lands on the Intelligence Chat launchpad', async () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
        initialTab="chat"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading character details...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('character-intelligence-chat-panel')).toBeInTheDocument();
    expect(mockOpenChatWithFocus).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should handle character with no data gracefully', () => {
    const emptyCharacter: Character = {
      ...mockCharacter,
      name: 'Unknown',
      summary: undefined,
      role: undefined,
    };

    render(
      <CharacterDetailModal
        character={emptyCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Should still render without crashing — check for Info tab (default)
    expect(screen.getAllByText(/^info$/i).length).toBeGreaterThan(0);
  });

  describe('entity type switcher (header)', () => {
    it('reclassifies through the header type menu and shows success', async () => {
      const user = userEvent.setup();
      render(
        <CharacterDetailModal
          character={mockCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      // Rendered in both mobile and desktop headers in jsdom.
      const [typeBadge] = screen.getAllByRole('button', { name: /reclassify entity type/i });
      await user.click(typeBadge);

      await user.click(screen.getByRole('menuitem', { name: /location \/ place/i }));

      await waitFor(() => {
        expect(reclassifyTrigger).toHaveBeenCalledWith({ id: 'char-1', targetDomain: 'location' });
      });
      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled();
      });
      expect(screen.getAllByText(/Moved to Location \/ Place/i).length).toBeGreaterThan(0);
    });

    it('surfaces the target book rule rejection and keeps the menu open', async () => {
      reclassifyTrigger.mockImplementationOnce(() => ({
        unwrap: vi.fn().mockRejectedValue({
          data: { error: 'Places rules rejected "John Doe" — it reads as a person name.' },
        }),
      }));

      const user = userEvent.setup();
      render(
        <CharacterDetailModal
          character={mockCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      const [typeBadge] = screen.getAllByRole('button', { name: /reclassify entity type/i });
      await user.click(typeBadge);
      await user.click(screen.getByRole('menuitem', { name: /location \/ place/i }));

      await waitFor(() => {
        expect(screen.getByText(/Places rules rejected "John Doe"/i)).toBeInTheDocument();
      });
      // Rejected move must not mark the card as moved.
      expect(screen.queryByText(/Moved to/i)).not.toBeInTheDocument();
    });

    it('does not offer the type switcher for the main character', () => {
      render(
        <CharacterDetailModal
          character={mockCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          isMainCharacter
        />
      );

      expect(screen.queryByRole('button', { name: /reclassify entity type/i })).not.toBeInTheDocument();
    });
  });

  describe('X post provenance', () => {
    it('shows a link back to the originating X post when metadata.external_sources has one', () => {
      const fromXPost: Character = {
        ...mockCharacter,
        name: 'Dave Fan',
        metadata: {
          external_sources: [
            {
              provider: 'x',
              sourceId: '123',
              url: 'https://x.com/demo_user/status/123',
              postedAt: new Date('2026-07-05').toISOString(),
              excerpt: 'Dave n Busters Hollywood got the best arcade games anywhere',
            },
          ],
        },
      };

      render(
        <CharacterDetailModal character={fromXPost} onClose={mockOnClose} onUpdate={mockOnUpdate} />
      );

      const link = screen.getByRole('link', { name: /from x/i });
      expect(link).toHaveAttribute('href', 'https://x.com/demo_user/status/123');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('shows no X chip without external sources', () => {
      render(
        <CharacterDetailModal character={mockCharacter} onClose={mockOnClose} onUpdate={mockOnUpdate} />
      );
      expect(screen.queryByRole('link', { name: /from x/i })).not.toBeInTheDocument();
    });
  });

  describe('distant but high impact', () => {
    it('shows "High impact" when minor and character_influence_on_user >= 70', () => {
      const highImpactMinor: Character = {
        ...mockCharacter,
        name: 'Distant Crush',
        importance_level: 'minor',
        analytics: {
          closeness_score: 40,
          relationship_depth: 40,
          interaction_frequency: 25,
          recency_score: 50,
          character_influence_on_user: 78,
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
          trend: 'stable',
        },
      };

      render(
        <CharacterDetailModal
          character={highImpactMinor}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText(/High impact/i)).toBeInTheDocument();
    });

    it('shows high-impact badge in header when background + influence >= 70', async () => {
      const highImpactBackground: Character = {
        ...mockCharacter,
        id: 'dummy-background-idol',
        name: 'Background Idol',
        importance_level: 'background',
        analytics: {
          closeness_score: 20,
          relationship_depth: 20,
          interaction_frequency: 10,
          recency_score: 30,
          character_influence_on_user: 85,
          user_influence_over_character: 5,
          importance_score: 15,
          priority_score: 40,
          relevance_score: 50,
          value_score: 65,
          sentiment_score: 70,
          trust_score: 40,
          support_score: 50,
          conflict_score: 5,
          engagement_score: 35,
          activity_level: 20,
          shared_experiences: 2,
          relationship_duration_days: 60,
          trend: 'stable',
        },
      };

      render(
        <CharacterDetailModal
          character={highImpactBackground}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="info"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/High impact/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      expect(await screen.findByText(/At a glance/i)).toBeInTheDocument();
      expect(await screen.findByText(/Your ranking/i)).toBeInTheDocument();
    });

    it('does not show high-impact badge when major even with high influence', () => {
      const majorHighInfluence: Character = {
        ...mockCharacter,
        name: 'Major Player',
        importance_level: 'major',
        analytics: {
          closeness_score: 80,
          relationship_depth: 80,
          interaction_frequency: 75,
          recency_score: 80,
          character_influence_on_user: 90,
          user_influence_over_character: 70,
          importance_score: 88,
          priority_score: 85,
          relevance_score: 90,
          value_score: 85,
          sentiment_score: 75,
          trust_score: 85,
          support_score: 80,
          conflict_score: 15,
          engagement_score: 85,
          activity_level: 80,
          shared_experiences: 25,
          relationship_duration_days: 365,
          trend: 'deepening',
        },
      };

      render(
        <CharacterDetailModal
          character={majorHighInfluence}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByText(/High impact/i)).not.toBeInTheDocument();
    });
  });

  describe('manual connections and memberships', () => {
    // dummy- ids skip the profile bundle so the tab content renders with the
    // character passed in (the default rejected fetch falls back to it).
    const baseCharacter: Character = { ...mockCharacter, id: 'dummy-conn-char' };

    it('adds an existing Character Book person as a connection', async () => {
      const { fetchJson } = await import('../../lib/api');
      const { fetchCharacterList } = await import('../../api/characterList');
      vi.mocked(fetchCharacterList).mockResolvedValue([
        { ...mockCharacter, id: 'char-2', name: 'Shy La' },
      ] as never);
      vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === '/api/relationships/character-links' && init?.method === 'POST') {
          return {
            success: true,
            relationship: { id: 'rel-9', character_id: 'char-2', character_name: 'Shy La', relationship_type: 'friend' },
          } as never;
        }
        throw new Error('Not found');
      });

      // Adding/removing a person here must broadcast lk:story-data-updated so the
      // Knowledge Base panel (and any other open view of the two characters) refreshes
      // instead of going stale — regression coverage for a bug where the handler called
      // the wrong storyRefresh export (a no-op subscribe instead of the dispatch).
      const storyUpdates: StoryDataUpdatedDetail[] = [];
      const onStoryUpdate = (e: Event) => storyUpdates.push((e as CustomEvent<StoryDataUpdatedDetail>).detail);
      window.addEventListener(STORY_DATA_UPDATED, onStoryUpdate);

      render(
        <CharacterDetailModal
          character={{ ...baseCharacter, relationships: [] }}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="relationships"
        />
      );

      await userEvent.click(await screen.findByTestId('add-connection-toggle'));
      const select = await screen.findByLabelText('Existing character');
      await waitFor(() => expect(screen.getByRole('option', { name: 'Shy La' })).toBeInTheDocument());
      await userEvent.selectOptions(select, 'char-2');
      await userEvent.click(screen.getByTestId('add-connection-submit'));

      expect(vi.mocked(fetchJson)).toHaveBeenCalledWith(
        '/api/relationships/character-links',
        expect.objectContaining({ method: 'POST' }),
      );
      await waitFor(() => expect(screen.getByText('Shy La')).toBeInTheDocument());
      expect(storyUpdates).toContainEqual(
        expect.objectContaining({ scopes: ['characters'], characterIds: expect.arrayContaining(['dummy-conn-char', 'char-2']) }),
      );

      window.removeEventListener(STORY_DATA_UPDATED, onStoryUpdate);
    });

    it('removes a connection via the trash button', async () => {
      const { fetchJson } = await import('../../lib/api');
      vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === '/api/relationships/character-links/rel-1' && init?.method === 'DELETE') {
          return { success: true } as never;
        }
        throw new Error('Not found');
      });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const storyUpdates: StoryDataUpdatedDetail[] = [];
      const onStoryUpdate = (e: Event) => storyUpdates.push((e as CustomEvent<StoryDataUpdatedDetail>).detail);
      window.addEventListener(STORY_DATA_UPDATED, onStoryUpdate);

      render(
        <CharacterDetailModal
          character={{
            ...baseCharacter,
            relationships: [
              { id: 'rel-1', character_id: 'char-2', character_name: 'Shy La', relationship_type: 'friend' },
            ],
          }}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="relationships"
        />
      );

      await userEvent.click(await screen.findByLabelText('Remove connection with Shy La'));
      await waitFor(() => expect(screen.queryByText('Shy La')).not.toBeInTheDocument());
      expect(vi.mocked(fetchJson)).toHaveBeenCalledWith(
        '/api/relationships/character-links/rel-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(storyUpdates).toContainEqual(
        expect.objectContaining({ scopes: ['characters'], characterIds: expect.arrayContaining(['dummy-conn-char', 'char-2']) }),
      );

      window.removeEventListener(STORY_DATA_UPDATED, onStoryUpdate);
    });

    it('adds the character to an existing group from the Groups & Organizations book', async () => {
      const { fetchJson } = await import('../../lib/api');
      vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === '/api/organizations') {
          return {
            success: true,
            organizations: [{ id: 'org-1', name: 'Ska Collective', user_relationship: 'member', members: [] }],
          } as never;
        }
        if (url === '/api/organizations/org-1/members' && init?.method === 'POST') {
          return { success: true, member: { id: 'm-1' } } as never;
        }
        if (url.startsWith('/api/organizations/by-character')) {
          // Simulate laggy/empty refetch — optimistic UI must still show the group.
          return { success: true, organizations: [] } as never;
        }
        throw new Error('Not found');
      });

      render(
        <CharacterDetailModal
          character={baseCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="relationships"
        />
      );

      await userEvent.click(await screen.findByTestId('add-membership-toggle'));
      const select = await screen.findByLabelText('Existing group or organization');
      await waitFor(() => expect(screen.getByRole('option', { name: 'Ska Collective' })).toBeInTheDocument());
      await userEvent.selectOptions(select, 'org-1');
      const roleSelect = screen.getByTestId('add-membership-role');
      // Scoped to this select: the "create a new group in chat" panel below renders its
      // own independent role select with the same option labels, so an unscoped
      // screen.getByRole('option', ...) is ambiguous between the two.
      expect(within(roleSelect).getByRole('option', { name: 'Leader' })).toBeInTheDocument();
      expect(within(roleSelect).getByRole('option', { name: 'Founder' })).toBeInTheDocument();
      await userEvent.selectOptions(roleSelect, 'leader');
      await userEvent.click(screen.getByTestId('add-membership-submit'));

      await waitFor(() =>
        expect(vi.mocked(fetchJson)).toHaveBeenCalledWith(
          '/api/organizations/org-1/members',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"role":"leader"'),
          }),
        ),
      );
      expect(await screen.findByText('Ska Collective')).toBeInTheDocument();
      expect(screen.getByTestId('character-groups-section')).toBeInTheDocument();
    });

    it('jumps to the exact thread and message when a "From your chats" mention is clicked', async () => {
      const user = userEvent.setup();
      characterQueryMock.state = {
        query: {
          characterId: mockCharacter.id,
          subject: 'other',
          generatedAt: new Date().toISOString(),
          sections: {
            identity: { ...mockCharacter },
            chatMentions: [
              {
                messageId: 'msg-42',
                sessionId: 'session-42',
                content: 'Ran into John Doe at the show',
                createdAt: '2026-07-01T12:00:00.000Z',
                sessionTitle: 'Show night',
              },
            ],
          },
        },
        loading: false,
        error: null,
        reload: vi.fn(),
        loadSections: vi.fn(),
      };

      render(
        <MemoryRouter>
          <CharacterDetailModal
            character={mockCharacter}
            onClose={mockOnClose}
            onUpdate={mockOnUpdate}
            initialTab="knowledge"
          />
        </MemoryRouter>,
      );

      await user.click(await screen.findByTestId('chat-mention-msg-42'));

      expect(sessionStorage.getItem('lk:chat-jump-message')).toBe('msg-42');
      expect(sessionStorage.getItem('lk:chat-jump-session')).toBe('session-42');
      expect(sessionStorage.getItem('lk:chat-jump-highlight')).toContain('John Doe');
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/chat/session-42');
    });

    it('shows real facts and crystallized knowledge on the Entity Knowledge Base tab', async () => {
      characterQueryMock.state = {
        query: {
          characterId: mockCharacter.id,
          subject: 'other',
          generatedAt: new Date().toISOString(),
          sections: {
            identity: { ...mockCharacter },
            knowledge: {
              characterId: mockCharacter.id,
              name: mockCharacter.name,
              aliases: [],
              summary: null,
              identityMentions: [],
              profile: { relationshipToUser: null, memoryCount: 0, timelineEventCount: 0, timelineEvents: [] },
              facts: [
                {
                  id: 'fact-1',
                  category: 'career',
                  fact: 'Works at Vanguard Robotics',
                  confidence: 0.9,
                  status: 'active',
                },
              ],
              knowledgeClaims: [
                {
                  id: 'claim-1',
                  human_readable_claim: 'Consistently shows up for John Doe during hard times',
                  confidence: 0.82,
                  knowledge_type: 'pattern',
                },
              ],
              sceneCandidates: [],
              relatedEntities: [],
              conversationLinks: [],
              intelligence: { totalEvidenceItems: 2, lastUpdated: null, learningScore: 40 },
            },
          },
        },
        loading: false,
        error: null,
        reload: vi.fn(),
        loadSections: vi.fn(),
      };

      render(
        <MemoryRouter>
          <CharacterDetailModal
            character={mockCharacter}
            onClose={mockOnClose}
            onUpdate={mockOnUpdate}
            initialTab="knowledge"
          />
        </MemoryRouter>,
      );

      expect(await screen.findByText('Works at Vanguard Robotics')).toBeInTheDocument();
      expect(screen.getByText('Consistently shows up for John Doe during hard times')).toBeInTheDocument();
      expect(screen.queryByText('No facts about John yet')).not.toBeInTheDocument();
      expect(screen.queryByText('No crystallized knowledge yet')).not.toBeInTheDocument();
    });

    it('loads Groups & Organizations with both character_id and character_name', async () => {
      const { fetchJson } = await import('../../lib/api');
      const byCharacterUrls: string[] = [];
      vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('/api/organizations/by-character')) {
          byCharacterUrls.push(url);
          return {
            success: true,
            organizations: [
              {
                id: 'org-amazon',
                name: 'Amazon',
                user_relationship: 'aware_of',
                members: [{ character_id: baseCharacter.id, character_name: baseCharacter.name, role: 'employee' }],
              },
            ],
          } as never;
        }
        throw new Error('Not found');
      });

      render(
        <CharacterDetailModal
          character={baseCharacter}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
          initialTab="relationships"
        />
      );

      await waitFor(() => {
        expect(byCharacterUrls.some((u) => u.includes('character_id=') && u.includes('character_name='))).toBe(
          true,
        );
      });
      expect(await screen.findByText('Amazon')).toBeInTheDocument();
    });
  });

  describe('renaming', () => {
    // Regression: a rename used to only broadcast lk:story-data-updated for
    // the main/self character, and even then without the 'family' scope —
    // so the Family Tree view (and anything else scoped to 'family') never
    // refetched the corrected name for an ordinary character.
    it('broadcasts a family-scoped story update for an ordinary (non-main) character rename', async () => {
      const storyUpdates: StoryDataUpdatedDetail[] = [];
      const onStoryUpdate = (e: Event) => storyUpdates.push((e as CustomEvent<StoryDataUpdatedDetail>).detail);
      window.addEventListener(STORY_DATA_UPDATED, onStoryUpdate);

      render(
        <CharacterDetailModal
          character={{ ...mockCharacter, id: 'dummy-rename-char', name: "Tio Ralph's" }}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      // Both the mobile and desktop header render their own EditableEntityName
      // instance for the name — only one is visible per viewport, but jsdom
      // doesn't hide either, so pick the first of each matching pair.
      const editButtons = await screen.findAllByLabelText('Edit character name');
      await userEvent.click(editButtons[0]);
      const input = screen.getAllByLabelText('Edit character name')[0];
      await userEvent.clear(input);
      await userEvent.type(input, 'Tio Ralph');
      await userEvent.click(screen.getAllByLabelText('Save character name')[0]);

      await waitFor(() => {
        expect(storyUpdates).toContainEqual(
          expect.objectContaining({
            scopes: expect.arrayContaining(['characters', 'family']),
            characterIds: ['dummy-rename-char'],
          }),
        );
      });

      window.removeEventListener(STORY_DATA_UPDATED, onStoryUpdate);
    });
  });
});

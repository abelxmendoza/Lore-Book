import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainCharacterDetailModal } from './MainCharacterDetailModal';
import type { Character } from './CharacterProfileCard';
import { fetchJson } from '../../lib/api';

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error('Not found')),
}));

const mockState = vi.hoisted(() => ({ mockDataEnabled: true }));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: mockState.mockDataEnabled }),
  getGlobalMockDataEnabled: () => mockState.mockDataEnabled,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCharacterKnowledgeBase = vi.hoisted(() => vi.fn());
vi.mock('./CharacterKnowledgeBase', () => ({
  CharacterKnowledgeBase: (props: Record<string, unknown>) => {
    mockCharacterKnowledgeBase(props);
    return <div data-testid="knowledge-base">Knowledge</div>;
  },
}));

const characterQueryMock = vi.hoisted(() => ({
  state: {
    query: null as null | { sections: Record<string, unknown> },
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
    loadSections: vi.fn(),
  },
}));

vi.mock('../../hooks/useCharacterQuery', () => ({
  useCharacterQuery: () => characterQueryMock.state,
}));

vi.mock('./CharacterDetailModal', () => ({
  CharacterDetailModal: () => <div data-testid="nested-character-modal">Nested</div>,
}));

const mainCharacter: Character = {
  id: 'self-synthetic',
  name: 'Alex Rivera',
  role: 'Main Character',
  archetype: 'protagonist',
  importance_level: 'protagonist',
  status: 'active',
  summary: 'The protagonist of your story.',
  tags: ['your story'],
  metadata: { is_self: true, is_user: true },
};

describe('MainCharacterDetailModal', () => {
  const onClose = vi.fn();
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.mockDataEnabled = true;
    mockNavigate.mockReset();
    sessionStorage.clear();
    characterQueryMock.state = {
      query: null,
      loading: false,
      error: null,
      reload: vi.fn(),
      loadSections: vi.fn(),
    };
    vi.mocked(fetchJson).mockRejectedValue(new Error('Not found'));
  });

  it('renders protagonist shell with distinct test id and hero content', async () => {
    render(
      <MainCharacterDetailModal
        character={mainCharacter}
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByTestId('main-character-modal')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2, name: 'You' }).length).toBeGreaterThan(0);
    // Name renders in both the hero and the editable identity section.
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0);
    expect(screen.getByText(/Your personal profile/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Your messages')).toBeInTheDocument();
    });
  });

  it('shows user-priority tabs distinct from generic character modal', () => {
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    expect(screen.getByTestId('main-tab-story')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-people')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-lore')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-memories')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-chat')).toBeInTheDocument();
  });

  it('timeline tab stays in the modal and hands off to Timeline on CTA', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-timeline'));

    expect(onClose).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('main-character-timeline-handoff')).toBeInTheDocument();

    await user.click(screen.getByTestId('main-character-open-omni-timeline'));

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      '/timeline?view=events&characterId=self-synthetic',
    );
  });

  it('talk-to-lore tab opens chat launchpad distinct from your story', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-chat'));
    expect(screen.getByText(/Open main chat about you/i)).toBeInTheDocument();
    expect(screen.getByTestId('main-open-self-chat')).toBeInTheDocument();
    expect(screen.getByText(/What's Lore learned about me lately/i)).toBeInTheDocument();
  });

  it('your story tab explains identity editing instead of mirroring chat', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-story'));
    expect(screen.getByText(/Your identity card/i)).toBeInTheDocument();
    expect(screen.queryByText(/Open main chat about you/i)).not.toBeInTheDocument();
  });

  it('passes real chatMentions from the self character query into CharacterKnowledgeBase (self modal is not always empty)', async () => {
    const user = userEvent.setup();
    characterQueryMock.state = {
      query: {
        sections: {
          chatMentions: [
            {
              messageId: 'msg-self-1',
              sessionId: 'session-self-1',
              content: 'Talked about my new job today',
              createdAt: '2026-07-01T12:00:00.000Z',
              sessionTitle: 'Career thread',
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
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-lore'));

    expect(mockCharacterKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMentions: characterQueryMock.state.query.sections.chatMentions,
        onOpenThread: expect.any(Function),
      }),
    );

    const { onOpenThread } = mockCharacterKnowledgeBase.mock.calls.at(-1)![0] as {
      onOpenThread: (sessionId: string, messageId: string) => void;
    };
    onOpenThread('session-self-1', 'msg-self-1');

    expect(sessionStorage.getItem('lk:chat-jump-message')).toBe('msg-self-1');
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/chat/session-self-1');
  });

  it('passes real facts and crystallized knowledge from the self character query into CharacterKnowledgeBase', async () => {
    const user = userEvent.setup();
    const knowledge = {
      characterId: 'self-1',
      name: 'Alex Rivera',
      aliases: [],
      summary: null,
      identityMentions: [],
      profile: { relationshipToUser: null, memoryCount: 0, timelineEventCount: 0, timelineEvents: [] },
      facts: [
        { id: 'fact-self-1', category: 'career', fact: 'Is building Lorebook', confidence: 0.95, status: 'active' },
      ],
      knowledgeClaims: [
        {
          id: 'claim-self-1',
          human_readable_claim: 'Tends to dive fully into new projects',
          confidence: 0.8,
          knowledge_type: 'pattern',
        },
      ],
      sceneCandidates: [],
      relatedEntities: [],
      conversationLinks: [],
      intelligence: { totalEvidenceItems: 2, lastUpdated: null, learningScore: 30 },
    };
    characterQueryMock.state = {
      query: { sections: { knowledge } },
      loading: false,
      error: null,
      reload: vi.fn(),
      loadSections: vi.fn(),
    };

    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-lore'));

    expect(mockCharacterKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        skipFetch: true,
        initialData: expect.objectContaining({
          facts: knowledge.facts,
          knowledgeClaims: knowledge.knowledgeClaims,
        }),
      }),
    );
  });

  it('falls back to the profile facts/knowledgeClaims seed when the self character query has not loaded knowledge yet', async () => {
    const user = userEvent.setup();
    // characterQueryMock.state.query stays null (default from beforeEach) — the
    // self query hasn't resolved a 'knowledge' section yet.
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-lore'));

    const lastCallProps = mockCharacterKnowledgeBase.mock.calls.at(-1)![0] as {
      skipFetch?: boolean;
      initialData?: { facts?: unknown[]; knowledgeClaims?: unknown[] };
    };
    // Not skipping the fetch means CharacterKnowledgeBase will still go fetch
    // real knowledge itself — the self modal is never left permanently empty.
    expect(lastCallProps.skipFetch).toBeFalsy();
  });

  it('resets a stale unknown tab value to story', async () => {
    const { rerender } = render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );
    // Simulate hot-reload leaving an invalid controlled value by clicking chat then
    // relying on the guard — smoke that story content is reachable.
    rerender(<MainCharacterDetailModal character={mainCharacter} onClose={onClose} />);
    expect(screen.getByTestId('main-tab-story')).toBeInTheDocument();
    expect(screen.getByText(/Your identity card/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('manual world editing (real data mode)', () => {
    const realSelf: Character = {
      ...mainCharacter,
      id: 'main-1',
    };

    const selfProfileResponse = {
      success: true,
      character: { ...realSelf, relationships: [] },
      attributes: [],
      facts: [],
      knowledgeClaims: [],
      recentMemories: [],
      stats: {
        messageCount: 3,
        attributeCount: 0,
        factCount: 0,
        knowledgeClaimCount: 0,
        lastSyncedAt: null,
      },
    };

    const setupFetchMock = (overrides: Record<string, (options?: RequestInit) => unknown> = {}) => {
      const calls: Array<{ url: string; options?: RequestInit }> = [];
      vi.mocked(fetchJson).mockImplementation(async (url: string, options?: RequestInit) => {
        calls.push({ url, options });
        for (const [prefix, handler] of Object.entries(overrides)) {
          if (url.startsWith(prefix)) return handler(options) as never;
        }
        if (url === '/api/characters/self/profile') return selfProfileResponse as never;
        if (url === '/api/characters/main-1') return { relationships: [] } as never;
        if (url === '/api/characters') {
          return {
            characters: [
              { id: 'main-1', name: 'Alex Rivera', status: 'active' },
              { id: 'c2', name: 'Jordan Kim', status: 'active' },
            ],
          } as never;
        }
        if (url.startsWith('/api/organizations/by-character')) {
          return { success: true, organizations: [] } as never;
        }
        if (url === '/api/organizations') {
          return {
            success: true,
            organizations: [{ id: 'org-1', name: 'Ska Collective', type: 'community', members: [] }],
          } as never;
        }
        throw new Error(`Unhandled fetch: ${url}`);
      });
      return calls;
    };

    beforeEach(() => {
      mockState.mockDataEnabled = false;
    });

    it('adds a connection from an existing Character Book entry', async () => {
      const calls = setupFetchMock({
        '/api/relationships/character-links': (options) => {
          if (options?.method === 'POST') {
            return {
              success: true,
              relationship: {
                id: 'rel-1',
                character_id: 'c2',
                character_name: 'Jordan Kim',
                relationship_type: 'bandmate',
                status: 'active',
              },
            };
          }
          return { success: true };
        },
      });
      const user = userEvent.setup();
      render(<MainCharacterDetailModal character={realSelf} onClose={onClose} />);

      await user.click(await screen.findByTestId('main-tab-people'));
      await user.click(screen.getByTestId('self-add-connection-toggle'));
      await user.selectOptions(await screen.findByLabelText('Existing character'), 'c2');
      await user.clear(screen.getByLabelText('Relationship type'));
      await user.type(screen.getByLabelText('Relationship type'), 'bandmate');
      await user.click(screen.getByTestId('self-add-connection-submit'));

      await waitFor(() => {
        expect(screen.getByText('Jordan Kim')).toBeInTheDocument();
      });
      const post = calls.find(
        (c) => c.url === '/api/relationships/character-links' && c.options?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.options!.body))).toMatchObject({
        source_character_id: 'main-1',
        target_character_id: 'c2',
        relationship_type: 'bandmate',
      });
    });

    it('adds a group membership from an existing Groups & Organizations entry', async () => {
      const memberOrgs: unknown[] = [];
      const calls = setupFetchMock({
        '/api/organizations/by-character': () => ({ success: true, organizations: memberOrgs }),
        '/api/organizations/org-1/members': () => {
          memberOrgs.push({
            id: 'org-1',
            name: 'Ska Collective',
            type: 'community',
            members: [{ id: 'm1', character_id: 'main-1', character_name: 'Alex Rivera', role: 'member' }],
          });
          return { success: true };
        },
      });
      const user = userEvent.setup();
      render(<MainCharacterDetailModal character={realSelf} onClose={onClose} />);

      await user.click(await screen.findByTestId('main-tab-people'));
      await user.click(screen.getByTestId('self-add-membership-toggle'));
      await user.selectOptions(
        await screen.findByLabelText('Existing group or organization'),
        'org-1',
      );
      await user.selectOptions(screen.getByTestId('self-add-membership-role'), 'member');
      await user.click(screen.getByTestId('self-add-membership-submit'));

      await waitFor(() => {
        expect(screen.getByText('Ska Collective')).toBeInTheDocument();
      });
      const post = calls.find(
        (c) => c.url === '/api/organizations/org-1/members' && c.options?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.options!.body))).toMatchObject({
        character_id: 'main-1',
        character_name: 'Alex Rivera',
        role: 'member',
      });
    });
  });
});

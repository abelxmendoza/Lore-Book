import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../features/chat/composer/ChatComposer', () => ({
  ChatComposer: () => <div data-testid="chat-composer">Chat Composer</div>,
}));

vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => ({
    streamChat: vi.fn().mockResolvedValue(undefined),
    isStreaming: false,
    cancel: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCharacterProfileBundle', () => ({
  useCharacterProfileBundle: () => ({
    bundle: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error('Not found')),
}));

vi.mock('../family/FamilyTreePanel', () => ({
  FamilyTreePanel: () => <div data-testid="family-tree-panel" />,
  CharacterAffiliationsPanel: () => null,
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
  RelationshipPeripheralsPanel: () => <div data-testid="relationship-peripherals-panel" />,
}));

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateCharacterMutation: () => [
    vi.fn(() => ({
      unwrap: vi.fn().mockResolvedValue({}),
    })),
  ],
  useReclassifyEntityMutation: () => [
    vi.fn(() => ({
      unwrap: vi.fn().mockResolvedValue({}),
    })),
  ],
  useAddCharacterToDatingBookMutation: () => [
    vi.fn(() => ({
      unwrap: vi.fn().mockResolvedValue({ created: true, relationship: { id: 'rel-new' } }),
    })),
  ],
}));

vi.mock('../../hooks/useAccountAuthority', () => ({
  useAccountAuthority: () => ({ authority: null, loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

import { CharacterDetailModal } from './CharacterDetailModal';
import { fetchJson } from '../../lib/api';

/**
 * Validates: if Amazon's People roster has N linked members, each character's
 * Connections → Groups section lists Amazon (two-way connection).
 */
describe('CharacterDetailModal roster ↔ Groups two-way sync', () => {
  beforeEach(() => {
    vi.mocked(fetchJson).mockReset();
    vi.mocked(fetchJson).mockRejectedValue(new Error('Not found'));
  });

  it('shows Amazon in Groups for each of three roster members', async () => {
    const rosterPeople = [
      { id: 'char-marcus', name: 'Marcus Chen', role: 'engineer' },
      { id: 'char-jamie', name: 'Jamie', role: 'designer' },
      { id: 'char-taylor', name: 'Taylor Nguyen', role: 'pm' },
    ];

    for (const person of rosterPeople) {
      vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('/api/organizations/by-character')) {
          expect(url).toContain(`character_id=${person.id}`);
          expect(url).toContain('character_name=');
          return {
            success: true,
            organizations: [
              {
                id: 'org-amazon',
                name: 'Amazon',
                user_relationship: 'aware_of',
                member_count: 3,
                members: rosterPeople.map((p) => ({
                  character_id: p.id,
                  character_name: p.name,
                  role: p.role,
                  status: 'active',
                })),
              },
            ],
          } as never;
        }
        throw new Error(`unexpected ${url}`);
      });

      const { unmount } = render(
        <CharacterDetailModal
          character={{ id: person.id, name: person.name } as any}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          initialTab="relationships"
        />,
      );

      // Re-query live each poll (not a captured element reference) — the modal
      // fires a second, intentionally-failing legacy-detail fetch alongside the
      // by-character org fetch, which can trigger a re-render that replaces this
      // section's DOM node after an earlier reference was captured but before
      // it was asserted on.
      await waitFor(() => {
        const section = screen.getByTestId('character-groups-section');
        expect(section).toHaveTextContent('1 total');
        expect(section).toHaveTextContent('Amazon');
      });

      unmount();
    }
  });

  it('lists Amazon after adding the character onto the roster from the character modal', async () => {
    vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/organizations') {
        return {
          success: true,
          organizations: [
            { id: 'org-amazon', name: 'Amazon', user_relationship: 'aware_of', members: [] },
          ],
        } as never;
      }
      if (url === '/api/organizations/org-amazon/members' && init?.method === 'POST') {
        return {
          success: true,
          member: {
            id: 'm-new',
            character_id: 'char-jamie',
            character_name: 'Jamie',
            role: 'employee',
          },
        } as never;
      }
      if (url.startsWith('/api/organizations/by-character')) {
        return { success: true, organizations: [] } as never;
      }
      throw new Error('Not found');
    });

    render(
      <CharacterDetailModal
        character={{ id: 'char-jamie', name: 'Jamie' } as any}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        initialTab="relationships"
      />,
    );

    await userEvent.click(await screen.findByTestId('add-membership-toggle'));
    await userEvent.selectOptions(
      await screen.findByLabelText('Existing group or organization'),
      'org-amazon',
    );
    await userEvent.selectOptions(screen.getByTestId('add-membership-role'), 'employee');
    await userEvent.click(screen.getByTestId('add-membership-submit'));

    expect(await screen.findByText('Amazon')).toBeInTheDocument();
  });
});

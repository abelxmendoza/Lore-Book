/**
 * Group People tab — link existing Character Book people onto a group roster.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { OrganizationDetailModal } from './OrganizationDetailModal';
import { ORGANIZATION_ROSTER_KNOWLEDGE_SCOPE } from '../chat/focusedEntityChatPresets';

const mockAddOrganizationMember = vi.fn();
const mockRemoveOrganizationMember = vi.fn();
const mockDispatchStoryDataUpdated = vi.fn();
const mockFetchCharacterList = vi.fn();
const mockOpenChatWithFocus = vi.fn();
const mockFetchJson = vi.fn();

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateOrganizationMutation: () => [vi.fn()],
  useDeleteOrganizationMutation: () => [vi.fn()],
  useAddOrganizationMemberMutation: () => [
    (...args: unknown[]) => {
      const result = mockAddOrganizationMember(...args);
      return { unwrap: () => result };
    },
  ],
  useRemoveOrganizationMemberMutation: () => [
    (...args: unknown[]) => {
      const result = mockRemoveOrganizationMember(...args);
      return { unwrap: () => result };
    },
  ],
  useAddOrganizationEventMutation: () => [vi.fn()],
  useRemoveOrganizationEventMutation: () => [vi.fn()],
  useAddOrganizationStoryMutation: () => [vi.fn()],
  useRemoveOrganizationStoryMutation: () => [vi.fn()],
  useAddOrganizationLocationMutation: () => [vi.fn()],
  useRemoveOrganizationLocationMutation: () => [vi.fn()],
  useAddOrganizationRelationshipMutation: () => [vi.fn()],
  useRemoveOrganizationRelationshipMutation: () => [vi.fn()],
}));

vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => ({ streamChat: vi.fn(), isStreaming: false, cancel: vi.fn() }),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

vi.mock('../../lib/storyRefresh', () => ({
  schedulePostChatRefresh: vi.fn(),
  onStoryDataUpdated: vi.fn(() => () => {}),
  dispatchStoryDataUpdated: (...args: unknown[]) => mockDispatchStoryDataUpdated(...args),
}));

vi.mock('../../lib/requestCache', () => ({
  invalidateCache: vi.fn(),
}));

vi.mock('../../lib/invalidateOrganizationMembershipCaches', () => ({
  invalidateOrganizationMembershipCaches: vi.fn(),
}));

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
}));

vi.mock('../../api/characterList', () => ({
  fetchCharacterList: (...args: unknown[]) => mockFetchCharacterList(...args),
}));

const seedOrg = {
  id: 'org-1',
  name: 'Static Petals',
  type: 'club',
  group_type: 'club',
  membership_model: 'strict',
  status: 'active',
  members: [] as Array<Record<string, unknown>>,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

vi.mock('../../lib/hydrateBookEntity', async () => {
  const actual = await vi.importActual<typeof import('../../lib/hydrateBookEntity')>(
    '../../lib/hydrateBookEntity',
  );
  return {
    ...actual,
    fetchOrganizationById: vi.fn(async () => ({
      id: 'org-1',
      name: 'Static Petals',
      type: 'club',
      group_type: 'club',
      membership_model: 'strict',
      status: 'active',
      members: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    isEphemeralEntityId: vi.fn(() => false),
  };
});

vi.mock('../../api/characterList', () => ({
  fetchCharacterList: vi.fn(async () => [
    { id: 'char-mina', name: 'Mina' },
    { id: 'char-owen', name: 'Owen' },
  ]),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../characters/CharacterDetailModal', () => ({
  CharacterDetailModal: () => null,
}));
vi.mock('../locations/LocationDetailModal', () => ({
  LocationDetailModal: () => null,
}));
vi.mock('../family/FamilyTreePanel', () => ({
  FamilyTreePanel: () => null,
}));
vi.mock('./OrganizationGroupNetwork', () => ({
  OrganizationGroupNetwork: () => null,
}));
vi.mock('./OrganizationActivityPanel', () => ({
  OrganizationActivityPanel: () => null,
}));

function renderModal(onClose = vi.fn()) {
  const store = configureStore({
    reducer: { _placeholder: (s = {}) => s },
  });
  return render(
    <Provider store={store}>
      <OrganizationDetailModal
        organization={seedOrg as any}
        onClose={onClose}
        onUpdate={vi.fn()}
      />
    </Provider>,
  );
}

describe('OrganizationDetailModal — People / Character Book link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/entities/book-index')) {
        return {
          entities: [
            { id: 'char-mina', name: 'Mina', type: 'character', aliases: ['Min'] },
            { id: 'char-owen', name: 'Owen', type: 'character', aliases: [] },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        };
      }
      if (url === '/api/characters' || url === '/api/books/characters') {
        return {
          characters: [
            { id: 'char-mina', name: 'Mina' },
            { id: 'char-owen', name: 'Owen' },
          ],
        };
      }
      if (url.includes('/derived-context')) {
        return {
          success: true,
          events: [],
          locations: [],
          hierarchy: { subgroups: [], related: [] },
        };
      }
      if (url.includes('/member-affiliations')) {
        return { success: true, affiliations: {} };
      }
      return {};
    });
    mockFetchCharacterList.mockResolvedValue([
      { id: 'char-mina', name: 'Mina', alias: ['Min'] },
      { id: 'char-owen', name: 'Owen' },
    ]);
    mockAddOrganizationMember.mockResolvedValue({
      success: true,
      member: {
        id: 'mem-1',
        character_id: 'char-mina',
        character_name: 'Mina',
        role: 'vocalist',
        status: 'active',
      },
    });
  });

  it('links an existing Character Book person with character_id', async () => {
    const user = userEvent.setup();
    renderModal();

    const peopleTabs = await screen.findAllByRole('button', { name: /people/i });
    fireEvent.click(peopleTabs[0]!);

    fireEvent.click(screen.getByTestId('org-add-member-toggle'));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entities/book-index?types=character'),
      );
    });

    const search = await screen.findByTestId('org-add-member-character-search');
    await user.click(search);
    await user.type(search, 'Min');

    const suggestion = await screen.findByRole('option', { name: 'Mina' });
    fireEvent.mouseDown(suggestion);

    expect(await screen.findByTestId('org-add-member-selected')).toHaveTextContent('Mina');

    const roleSelect = screen.getByTestId('org-add-member-role');
    await user.selectOptions(roleSelect, '__custom__');
    const customRole = await screen.findByTestId('org-add-member-role-custom');
    await user.clear(customRole);
    await user.type(customRole, 'vocalist');
    fireEvent.click(screen.getByTestId('org-add-member-submit'));

    await waitFor(() => {
      expect(mockAddOrganizationMember).toHaveBeenCalledWith({
        organizationId: 'org-1',
        member: {
          character_id: 'char-mina',
          character_name: 'Mina',
          role: 'vocalist',
          status: 'active',
        },
      });
    });

    expect(await screen.findByText('Mina')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(await screen.findByTestId('org-add-member-success')).toHaveTextContent(
      /linked to this group and saved in your knowledge base/i,
    );
    expect(mockDispatchStoryDataUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ['organizations', 'characters'],
        organizationIds: ['org-1'],
        characterIds: ['char-mina'],
      }),
    );
  });

  it('surfaces RTK mutation errors instead of a generic link failure', async () => {
    mockAddOrganizationMember.mockRejectedValue({
      status: 500,
      message: 'Character not found in your Character Book',
    });
    const user = userEvent.setup();
    renderModal();

    const peopleTabs = await screen.findAllByRole('button', { name: /people/i });
    fireEvent.click(peopleTabs[0]!);
    fireEvent.click(screen.getByTestId('org-add-member-toggle'));

    const search = await screen.findByTestId('org-add-member-character-search');
    await user.click(search);
    await user.type(search, 'Mina');
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'Mina' }));
    fireEvent.click(screen.getByTestId('org-add-member-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /character not found in your character book/i,
    );
  });

  it('keeps indexed people when the heavy Character Book request fails', async () => {
    mockFetchCharacterList.mockRejectedValue(new Error('timeout'));
    mockFetchJson.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/entities/book-index')) {
        return {
          entities: [{ id: 'char-mina', name: 'Mina', type: 'character', aliases: [] }],
        };
      }
      if (url === '/api/characters' || url === '/api/books/characters') {
        throw new Error('timeout');
      }
      if (url.includes('/derived-context')) {
        return { success: true, events: [], locations: [], hierarchy: { subgroups: [], related: [] } };
      }
      return {};
    });

    const user = userEvent.setup();
    renderModal();
    const peopleTabs = await screen.findAllByRole('button', { name: /people/i });
    fireEvent.click(peopleTabs[0]!);
    fireEvent.click(screen.getByTestId('org-add-member-toggle'));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entities/book-index?types=character'),
      );
    });

    expect(screen.queryByText(/could not load your character book/i)).not.toBeInTheDocument();

    const search = await screen.findByTestId('org-add-member-character-search');
    await user.click(search);
    await user.type(search, 'Mina');
    expect(await screen.findByRole('option', { name: 'Mina' })).toBeInTheDocument();
  });

  it('filters Character Book options by typed search', async () => {
    const user = userEvent.setup();
    renderModal();
    const peopleTabs = await screen.findAllByRole('button', { name: /people/i });
    fireEvent.click(peopleTabs[0]!);
    fireEvent.click(screen.getByTestId('org-add-member-toggle'));

    const search = await screen.findByTestId('org-add-member-character-search');
    await waitFor(() =>
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entities/book-index?types=character'),
      ),
    );

    await user.click(search);
    await user.type(search, 'owe');

    await waitFor(() => {
      const options = screen.getAllByRole('option').map((el) => el.textContent);
      expect(options).toContain('Owen');
      expect(options).not.toContain('Mina');
    });
  });

  it('Fill roster in chat hands off to main chat with affiliation scope', async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    const peopleTabs = await screen.findAllByRole('button', { name: /people/i });
    fireEvent.click(peopleTabs[0]!);
    fireEvent.click(screen.getByTestId('org-fill-roster-in-chat-empty'));

    expect(onClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'org-1',
        entityName: 'Static Petals',
        entityType: 'organization',
        sourceSurface: 'organizations',
        knowledgeScope: ORGANIZATION_ROSTER_KNOWLEDGE_SCOPE,
        initialPrompt: expect.stringMatching(/fill out the roster|affiliated|NOT in the group/i),
        arrivedAt: expect.any(Number),
      }),
    );
  });
});

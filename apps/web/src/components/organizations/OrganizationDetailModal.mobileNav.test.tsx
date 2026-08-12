/**
 * Group modal — mobile-only collapsible header + shared bottom nav's Delete chip.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { OrganizationDetailModal } from './OrganizationDetailModal';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateOrganizationMutation: () => [vi.fn(() => ({ unwrap: async () => ({}) }))],
  useDeleteOrganizationMutation: () => [vi.fn(() => ({ unwrap: async () => ({}) }))],
  useAddOrganizationMemberMutation: () => [vi.fn(() => ({ unwrap: async () => ({}) }))],
  useRemoveOrganizationMemberMutation: () => [vi.fn(() => ({ unwrap: async () => ({}) }))],
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
}));

vi.mock('../../lib/hydrateBookEntity', async () => {
  const actual = await vi.importActual<typeof import('../../lib/hydrateBookEntity')>(
    '../../lib/hydrateBookEntity',
  );
  return {
    ...actual,
    fetchOrganizationById: vi.fn(async () => seedOrg),
    isEphemeralEntityId: vi.fn(() => false),
  };
});

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(async () => ({})),
}));

vi.mock('../../lib/cache', () => ({
  apiCache: { deletePattern: vi.fn() },
}));

vi.mock('../characters/CharacterDetailModal', () => ({ CharacterDetailModal: () => null }));
vi.mock('../locations/LocationDetailModal', () => ({ LocationDetailModal: () => null }));
vi.mock('../family/FamilyTreePanel', () => ({ FamilyTreePanel: () => null }));
vi.mock('./OrganizationGroupNetwork', () => ({ OrganizationGroupNetwork: () => null }));
vi.mock('./OrganizationActivityPanel', () => ({ OrganizationActivityPanel: () => null }));

const seedOrg = {
  id: 'org-1',
  name: 'Static Petals',
  type: 'club' as const,
  group_type: 'club' as const,
  membership_model: 'strict' as const,
  status: 'active' as const,
  aliases: [],
  members: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function renderModal() {
  const store = configureStore({ reducer: { _placeholder: (s = {}) => s } });
  return render(
    <Provider store={store}>
      <OrganizationDetailModal organization={seedOrg as any} onClose={vi.fn()} onUpdate={vi.fn()} />
    </Provider>,
  );
}

describe('OrganizationDetailModal — mobile header collapse + bottom nav danger chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with the header collapsed on mobile and expands on toggle', () => {
    renderModal();

    const badgesRow = screen.getByTestId('org-header-badges-row');
    const statsRow = screen.getByTestId('org-header-stats-row');
    expect(badgesRow.className).toMatch(/\bhidden\b/);
    expect(statsRow.className).toMatch(/\bhidden\b/);

    fireEvent.click(screen.getByRole('button', { name: /expand group details/i }));

    expect(badgesRow.className).not.toMatch(/\bhidden\b/);
    expect(statsRow.className).not.toMatch(/\bhidden\b/);
    expect(screen.getByRole('button', { name: /collapse group details/i })).toBeInTheDocument();
  });

  it('renders Delete group as the bottom nav dangerAction chip and switches to the danger tab on click', () => {
    renderModal();

    const deleteChip = screen.getByRole('button', { name: /delete group/i });
    fireEvent.click(deleteChip);

    expect(screen.getByText(`Delete ${seedOrg.name}?`)).toBeInTheDocument();
  });
});

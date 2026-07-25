/**
 * Group modal chat should hand off to main chat with a focus chip — no in-modal composer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { OrganizationDetailModal } from './OrganizationDetailModal';

const mockOpenChatWithFocus = vi.fn();

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateOrganizationMutation: () => [vi.fn()],
  useDeleteOrganizationMutation: () => [vi.fn()],
  useAddOrganizationMemberMutation: () => [vi.fn()],
  useRemoveOrganizationMemberMutation: () => [vi.fn()],
  useAddOrganizationEventMutation: () => [vi.fn()],
  useRemoveOrganizationEventMutation: () => [vi.fn()],
  useAddOrganizationStoryMutation: () => [vi.fn()],
  useRemoveOrganizationStoryMutation: () => [vi.fn()],
  useAddOrganizationLocationMutation: () => [vi.fn()],
  useRemoveOrganizationLocationMutation: () => [vi.fn()],
  useAddOrganizationRelationshipMutation: () => [vi.fn()],
  useRemoveOrganizationRelationshipMutation: () => [vi.fn()],
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

vi.mock('../../lib/storyRefresh', () => ({
  onStoryDataUpdated: vi.fn(() => () => {}),
  dispatchStoryDataUpdated: vi.fn(),
}));

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
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
  id: 'org-northwind',
  name: 'Northwind Crew',
  type: 'club',
  group_type: 'club',
  membership_model: 'strict',
  status: 'active',
  members: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function renderModal(onClose = vi.fn()) {
  const store = configureStore({ reducer: { _placeholder: (s = {}) => s } });
  return render(
    <Provider store={store}>
      <OrganizationDetailModal organization={seedOrg as any} onClose={onClose} onUpdate={vi.fn()} />
    </Provider>,
  );
}

describe('OrganizationDetailModal — chat redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('header Chat opens main chat with the group focus chip context', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByRole('button', { name: /chat about this group/i }));

    expect(onClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'org-northwind',
        entityName: 'Northwind Crew',
        entityType: 'organization',
        sourceSurface: 'organizations',
        arrivedAt: expect.any(Number),
      }),
    );
    expect(screen.queryByPlaceholderText(/ask about/i)).not.toBeInTheDocument();
  });

  it('Chat nav tab redirects to main chat instead of an in-modal composer', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getAllByRole('button', { name: /^chat$/i })[0]!);

    expect(onClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'org-northwind',
        entityType: 'organization',
        sourceSurface: 'organizations',
      }),
    );
  });
});

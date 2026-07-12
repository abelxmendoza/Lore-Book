/**
 * Group modal — rename + alias add/remove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { OrganizationDetailModal } from './OrganizationDetailModal';

const mockUpdateOrganization = vi.fn();

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateOrganizationMutation: () => [
    (...args: unknown[]) => {
      const result = mockUpdateOrganization(...args);
      return { unwrap: () => result };
    },
  ],
  useDeleteOrganizationMutation: () => [vi.fn()],
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
vi.mock('./OrganizationTimelinePanel', () => ({ OrganizationTimelinePanel: () => null }));

const seedOrg = {
  id: 'org-1',
  name: 'Static Petals',
  type: 'club' as const,
  group_type: 'club' as const,
  membership_model: 'strict' as const,
  status: 'active' as const,
  aliases: ['Petals'],
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

describe('OrganizationDetailModal — name + aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOrganization.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({
      success: true,
      organization: {
        ...seedOrg,
        ...values,
        name: (values.name as string) ?? seedOrg.name,
        aliases: (values.aliases as string[]) ?? seedOrg.aliases,
      },
    }));
  });

  it('renames the group from the header pencil', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /edit group name/i }));
    const input = screen.getByLabelText(/edit group name/i);
    fireEvent.change(input, { target: { value: 'Static Petals Collective' } });
    fireEvent.click(screen.getByRole('button', { name: /save group name/i }));

    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'org-1',
          values: expect.objectContaining({ name: 'Static Petals Collective' }),
        }),
      );
    });
  });

  it('adds and removes aliases from the chip editor', async () => {
    renderModal();

    expect(screen.getByTestId('org-alias-editor')).toBeInTheDocument();
    expect(screen.getByText('Petals')).toBeInTheDocument();

    const addInput = screen.getByTestId('org-alias-add-input');
    fireEvent.change(addInput, { target: { value: 'SP' } });
    fireEvent.keyDown(addInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'org-1',
          values: expect.objectContaining({ aliases: expect.arrayContaining(['Petals', 'SP']) }),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /remove alias Petals/i }));

    await waitFor(() => {
      const last = mockUpdateOrganization.mock.calls.at(-1)?.[0];
      expect(last.values.aliases).not.toContain('Petals');
    });
  });
});

/**
 * Group Places tab — link existing Places Book locations onto a group.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { OrganizationDetailModal } from './OrganizationDetailModal';

const mockAddOrganizationLocation = vi.fn();
const mockFetchJson = vi.fn();

vi.mock('../../store/api/entitiesApi', () => ({
  useUpdateOrganizationMutation: () => [vi.fn()],
  useDeleteOrganizationMutation: () => [vi.fn()],
  useAddOrganizationMemberMutation: () => [vi.fn()],
  useRemoveOrganizationMemberMutation: () => [vi.fn()],
  useAddOrganizationEventMutation: () => [vi.fn()],
  useRemoveOrganizationEventMutation: () => [vi.fn()],
  useAddOrganizationStoryMutation: () => [vi.fn()],
  useRemoveOrganizationStoryMutation: () => [vi.fn()],
  useAddOrganizationLocationMutation: () => [
    (...args: unknown[]) => {
      const result = mockAddOrganizationLocation(...args);
      return { unwrap: () => result };
    },
  ],
  useRemoveOrganizationLocationMutation: () => [vi.fn()],
  useAddOrganizationRelationshipMutation: () => [vi.fn()],
  useRemoveOrganizationRelationshipMutation: () => [vi.fn()],
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

vi.mock('../../lib/storyRefresh', () => ({
  schedulePostChatRefresh: vi.fn(),
  onStoryDataUpdated: vi.fn(() => () => {}),
  dispatchStoryDataUpdated: vi.fn(),
}));

vi.mock('../../lib/hydrateBookEntity', async () => {
  const actual = await vi.importActual<typeof import('../../lib/hydrateBookEntity')>(
    '../../lib/hydrateBookEntity',
  );
  return {
    ...actual,
    fetchOrganizationById: vi.fn(async () => seedOrg),
    fetchLocationById: vi.fn(async () => ({
      id: 'loc-depot',
      name: 'Northwind Depot',
      visitCount: 3,
      relatedPeople: [],
      tagCounts: [],
      chapters: [],
      moods: [],
      entries: [],
      sources: [],
    })),
    isEphemeralEntityId: vi.fn(() => false),
  };
});

vi.mock('../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../characters/CharacterDetailModal', () => ({ CharacterDetailModal: () => null }));
vi.mock('../locations/LocationDetailModal', () => ({ LocationDetailModal: () => null }));
vi.mock('../family/FamilyTreePanel', () => ({ FamilyTreePanel: () => null }));
vi.mock('./OrganizationGroupNetwork', () => ({ OrganizationGroupNetwork: () => null }));
vi.mock('./OrganizationActivityPanel', () => ({ OrganizationActivityPanel: () => null }));
vi.mock('../../features/chat/composer/ChatComposer', () => ({
  ChatComposer: () => null,
}));
vi.mock('../../features/chat/message/ChatMessage', () => ({
  ChatMessage: () => null,
}));

const seedOrg = {
  id: 'org-1',
  name: 'Northwind Crew',
  type: 'club',
  group_type: 'club',
  membership_model: 'strict',
  status: 'active',
  members: [],
  locations: [] as Array<Record<string, unknown>>,
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

describe('OrganizationDetailModal — Places / Places Book link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/entities/book-index')) {
        return {
          entities: [
            { id: 'loc-depot', name: 'Northwind Depot', type: 'location', aliases: ['The Depot'] },
            { id: 'loc-gym', name: 'Vanguard Gym', type: 'location', aliases: [] },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        };
      }
      if (url === '/api/books/locations') {
        return {
          locations: [
            { id: 'loc-depot', name: 'Northwind Depot', metadata: { aliases: ['The Depot'] } },
            { id: 'loc-gym', name: 'Vanguard Gym' },
            { id: 'loc-cafe', name: 'Corner Cafe' },
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
    mockAddOrganizationLocation.mockResolvedValue({
      success: true,
      location: {
        id: 'org-loc-1',
        location_id: 'loc-depot',
        location_name: 'Northwind Depot',
        visit_count: 1,
      },
    });
  });

  it('links an existing Places Book location with location_id', async () => {
    const user = userEvent.setup();
    renderModal();

    const placesTabs = await screen.findAllByRole('button', { name: /places/i });
    fireEvent.click(placesTabs[0]!);

    fireEvent.click(screen.getByTestId('org-add-location-toggle'));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entities/book-index?types=location'),
      );
    });

    const search = await screen.findByTestId('org-add-location-place-search');
    await user.click(search);
    await user.type(search, 'Depot');

    const suggestion = await screen.findByRole('option', { name: 'Northwind Depot' });
    fireEvent.mouseDown(suggestion);

    expect(await screen.findByTestId('org-add-location-selected')).toHaveTextContent('Northwind Depot');
    fireEvent.click(screen.getByTestId('org-add-location-submit'));

    await waitFor(() => {
      expect(mockAddOrganizationLocation).toHaveBeenCalledWith({
        organizationId: 'org-1',
        location: {
          location_id: 'loc-depot',
          location_name: 'Northwind Depot',
        },
      });
    });

    expect(await screen.findByText('Northwind Depot')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(await screen.findByTestId('org-add-location-success')).toHaveTextContent(
      /linked to this group from your Places Book/i,
    );
  });

  it('keeps indexed places when the heavy Places Book request fails', async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/entities/book-index')) {
        return {
          entities: [{ id: 'loc-depot', name: 'Northwind Depot', type: 'location', aliases: [] }],
        };
      }
      if (url === '/api/books/locations' || url === '/api/locations') {
        throw new Error('timeout');
      }
      if (url.includes('/derived-context')) {
        return { success: true, events: [], locations: [], hierarchy: { subgroups: [], related: [] } };
      }
      return {};
    });

    const user = userEvent.setup();
    renderModal();
    fireEvent.click((await screen.findAllByRole('button', { name: /places/i }))[0]!);
    fireEvent.click(screen.getByTestId('org-add-location-toggle'));

    const search = await screen.findByTestId('org-add-location-place-search');
    await user.click(search);

    expect(await screen.findByRole('option', { name: 'Northwind Depot' })).toBeInTheDocument();
    expect(screen.queryByText(/Could not load your Places Book/i)).not.toBeInTheDocument();
  });

  it('filters Places Book options by typed search without reloading', async () => {
    const user = userEvent.setup();
    renderModal();

    const placesTabs = await screen.findAllByRole('button', { name: /places/i });
    fireEvent.click(placesTabs[0]!);
    fireEvent.click(screen.getByTestId('org-add-location-toggle'));

    const search = await screen.findByTestId('org-add-location-place-search');
    await waitFor(() =>
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entities/book-index?types=location'),
      ),
    );
    const callsBeforeType = mockFetchJson.mock.calls.length;

    await user.click(search);
    await user.type(search, 'Bad');

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Northwind Depot' })).not.toBeInTheDocument();
    });
    // Typing must not trigger a destructive Places reload.
    expect(mockFetchJson.mock.calls.length).toBe(callsBeforeType);
    expect(screen.queryByText(/Could not load your Places Book/i)).not.toBeInTheDocument();
  });
});

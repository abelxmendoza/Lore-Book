import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
}));

vi.mock('../../store/hooks/useEntityBooks', () => ({
  useBookEntityIndexSearch: () => ({
    entities: [],
    total: 0,
    counts: {},
    isSearching: false,
    isActive: false,
    error: undefined,
    source: 'demo',
  }),
  useOrganizationsBookData: () => ({
    organizations: [],
    candidates: [],
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../lib/storyRefresh', () => ({
  onStoryDataUpdated: () => () => {},
}));

vi.mock('./OrganizationDetailModal', () => ({
  OrganizationDetailModal: () => null,
}));

vi.mock('../groups/GroupSuggestions', () => ({
  GroupSuggestions: () => null,
}));

vi.mock('../groups/GroupMergePanel', () => ({
  GroupMergePanel: () => null,
}));

vi.mock('../chat/FocusedEntityChatLauncher', () => ({
  FocusedEntityChatLauncher: () => null,
}));

vi.mock('../ontology/OntologyCompliancePanel', () => ({
  OntologyCompliancePanel: () => null,
}));

import { fetchJson } from '../../lib/api';

import { OrganizationsBook } from './OrganizationsBook';

describe('OrganizationsBook Demo Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a synthetic group locally without calling the organizations API', async () => {
    render(<OrganizationsBook />);

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByPlaceholderText('Name *'), {
      target: { value: 'Vanguard Robotics Circle' },
    });
    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), {
      target: { value: 'A synthetic demo collaboration group.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getAllByText('Vanguard Robotics Circle').length).toBeGreaterThan(0);
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('answers roster queries from synthetic Demo Mode data', async () => {
    render(<OrganizationsBook />);

    fireEvent.change(screen.getByLabelText('Ask your Groups and Organizations Book'), {
      target: { value: 'Show groups with Marcus Johnson' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Book' }));

    await waitFor(() => {
      expect(screen.getByText(/\d+ matching groups?/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText('Roster includes Marcus Johnson').length).toBeGreaterThan(0);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

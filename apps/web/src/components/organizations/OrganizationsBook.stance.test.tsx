import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  }),
  useOrganizationsBookData: () => ({
    organizations: [],
    candidates: [],
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ success: true, tree: { members: [] } }),
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

import { OrganizationsBook } from './OrganizationsBook';

describe('OrganizationsBook stance switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the relationship switcher above group type tabs', async () => {
    render(<OrganizationsBook />);

    expect(await screen.findByTestId('org-stance-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('org-stance-mine')).toHaveTextContent('Mine');
    expect(screen.getByTestId('org-stance-close_to')).toHaveTextContent('Close to');
    expect(screen.getByTestId('org-stance-their_world')).toHaveTextContent('Their world');
    expect(screen.getByTestId('org-stance-mentioned')).toHaveTextContent('Mentioned');
    expect(screen.getByText('Group type')).toBeInTheDocument();
  });

  it('filters the book when switching stance', async () => {
    const user = userEvent.setup();
    render(<OrganizationsBook />);

    await screen.findByTestId('org-stance-switcher');
    await user.click(screen.getByTestId('org-stance-mentioned'));
    expect(screen.getByTestId('org-stance-mentioned')).toHaveAttribute('aria-selected', 'true');

    // Demo mock data includes public/referenced entities like Apple.
    expect(await screen.findByText('Apple')).toBeInTheDocument();
  });
});

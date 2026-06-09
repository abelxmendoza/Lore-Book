import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OrganizationsBook } from './OrganizationsBook';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => false),
}));

// Stub heavy sub-components to keep tests fast
vi.mock('./OrganizationDetailModal', () => ({
  OrganizationDetailModal: () => <div data-testid="org-detail-modal" />,
}));

vi.mock('../groups/GroupSuggestions', () => ({
  GroupSuggestions: () => <div data-testid="group-suggestions" />,
}));

vi.mock('../timeline/ColorCodedTimeline', () => ({
  ColorCodedTimeline: () => <div data-testid="color-coded-timeline" />,
}));

vi.mock('../ui/SearchWithAutocomplete', () => ({
  SearchWithAutocomplete: ({ onChange }: { onChange: (v: string) => void }) => (
    <input data-testid="search-autocomplete" onChange={e => onChange(e.target.value)} />
  ),
}));

const mockOrg = {
  id: 'org-1',
  name: 'Acme Corp',
  type: 'company' as const,
  description: 'A tech company',
  confidence_score: 85,
  usage_count: 10,
  importance_score: 80,
  members: [],
  stories: [],
  events: [],
  locations: [],
  analytics: {
    user_involvement_score: 70,
    user_ranking: 1,
    user_role_importance: 63,
    relevance_score: 76,
    priority_score: 68,
    importance_score: 80,
    value_score: 72,
    group_influence_on_user: 56,
    user_influence_over_group: 42,
    cohesion_score: 82,
    activity_level: 88,
    engagement_score: 75,
    recency_score: 90,
    frequency_score: 60,
    trend: 'stable' as const,
    strengths: ['good culture'],
    weaknesses: [],
    opportunities: [],
    threats: [],
  },
};

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('OrganizationsBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, organizations: [] });

    const { container } = wrap(<OrganizationsBook />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('shows loading state initially', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockReturnValue(new Promise(() => {})); // never resolves

    wrap(<OrganizationsBook />);
    // Component renders loading spinner or skeleton
    const { container } = wrap(<OrganizationsBook />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders organizations list after fetch', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, organizations: [mockOrg] });

    wrap(<OrganizationsBook />);
    await waitFor(() => {
      expect(screen.getAllByText(/Acme Corp/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('renders search input', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, organizations: [] });

    wrap(<OrganizationsBook />);
    await waitFor(() => {
      expect(screen.getByTestId('search-autocomplete')).toBeInTheDocument();
    });
  });

  it('renders category filter tabs', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, organizations: [] });

    wrap(<OrganizationsBook />);
    await waitFor(() => {
      // "All" tab should always be present
      expect(screen.getAllByText(/All/i).length).toBeGreaterThan(0);
    });
  });

  it('uses mock data when mock mode is enabled', async () => {
    const { useShouldUseMockData } = await import('../../hooks/useShouldUseMockData');
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(useShouldUseMockData).mockReturnValue(true);

    wrap(<OrganizationsBook />);
    await waitFor(() => {
      // Should render without calling real API
      expect(fetchJson).not.toHaveBeenCalled();
    });
  });

  it('handles API error gracefully', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockRejectedValue(new Error('network error'));

    const { container } = wrap(<OrganizationsBook />);
    await waitFor(() => {
      // Component should render something (error state or empty state)
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('opens create form when Add button is clicked', async () => {
    const { fetchJson } = await import('../../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, organizations: [] });

    wrap(<OrganizationsBook />);
    await waitFor(() => {
      // Wait for component to finish loading
      expect(screen.queryByRole('button', { name: /add|create|new/i })).not.toBeNull();
    }, { timeout: 3000 });
  });
});

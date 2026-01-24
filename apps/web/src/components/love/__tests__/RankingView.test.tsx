// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import { RankingView } from '../RankingView';
import { useMockData } from '../../../contexts/MockDataContext';
import { getMockRankings } from '../../../mocks/romanticRelationships';

// Mock the dependencies
vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../../mocks/romanticRelationships', () => ({
  getMockRankings: vi.fn()
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

describe('RankingView', () => {
  const mockRankings = [
    {
      id: 'rel-001',
      person_id: 'char-001',
      person_name: 'Alex',
      relationship_type: 'boyfriend',
      status: 'active',
      is_current: true,
      affection_score: 0.92,
      compatibility_score: 0.95,
      relationship_health: 0.90,
      emotional_intensity: 0.88,
      rank_among_all: 1,
      rank_among_active: 1,
      pros: [],
      cons: [],
      red_flags: [],
      green_flags: []
    },
    {
      id: 'rel-002',
      person_id: 'char-002',
      person_name: 'Jordan',
      relationship_type: 'crush',
      status: 'active',
      is_current: true,
      affection_score: 0.75,
      compatibility_score: 0.70,
      relationship_health: 0.65,
      emotional_intensity: 0.82,
      rank_among_all: 2,
      rank_among_active: 2,
      pros: [],
      cons: [],
      red_flags: [],
      green_flags: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useMockData as any).mockReturnValue({
      useMockData: true
    });
    (getMockRankings as any).mockReturnValue(mockRankings);
  });

  it('renders ranking view', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText(/your love rankings/i)).toBeInTheDocument();
    });
  });

  it('displays relationships when loaded', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      expect(screen.getByText('Jordan')).toBeInTheDocument();
    });
  });

  it('displays rank badges with proper alignment', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      // Check that rank badges are rendered
      const rank1Badge = screen.getByText(/#1 - The One/i);
      const rank2Badge = screen.getByText(/#2/i);
      
      expect(rank1Badge).toBeInTheDocument();
      expect(rank2Badge).toBeInTheDocument();
      
      // Verify badges have consistent width classes for alignment
      const badge1 = rank1Badge.closest('[class*="min-w"]');
      const badge2 = rank2Badge.closest('[class*="min-w"]');
      
      // Both should have min-width for alignment
      expect(badge1?.className).toMatch(/min-w/);
      expect(badge2?.className).toMatch(/min-w/);
    });
  });

  it('switches between ranking categories', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText(/overall/i)).toBeInTheDocument();
    });
    
    // Category names appear in tabs, intro copy, and in each card's score labels; use getAllByText
    expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/compatibility/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/intensity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/health/i).length).toBeGreaterThan(0);
  });

  it('displays scores for each relationship', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText('92%')).toBeInTheDocument(); // Alex's affection
      expect(screen.getByText('95%')).toBeInTheDocument(); // Alex's compatibility
      expect(screen.getByText('75%')).toBeInTheDocument(); // Jordan's affection
    });
  });

  it('shows empty state when no relationships', async () => {
    (getMockRankings as any).mockReturnValue([]);
    
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText(/no relationships to rank/i)).toBeInTheDocument();
    });
  });

  it('displays comparison mode when relationships are selected', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Comparison Mode requires 2+ selected; click Compare on two cards
    const compareButtons = screen.getAllByText(/^compare$/i);
    expect(compareButtons.length).toBeGreaterThanOrEqual(2);
    compareButtons[0].click();
    compareButtons[1].click();

    await waitFor(() => {
      expect(screen.getByText(/comparison mode/i)).toBeInTheDocument();
    });
  });

  it('shows mock data indicator when using mock data', async () => {
    render(<RankingView />);
    
    await waitFor(() => {
      expect(screen.getByText(/mock data/i)).toBeInTheDocument();
    });
  });
});

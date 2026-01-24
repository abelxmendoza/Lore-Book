// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import { LoveAndRelationshipsView } from '../LoveAndRelationshipsView';
import { useMockData } from '../../../contexts/MockDataContext';
import { getMockRomanticRelationshipsByFilter } from '../../../mocks/romanticRelationships';

// Mock dependencies
vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn()
}));

vi.mock('../../../mocks/romanticRelationships', () => ({
  getMockRomanticRelationshipsByFilter: vi.fn(),
  getMockRomanticRelationships: vi.fn()
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

describe('LoveAndRelationshipsView', () => {
  const mockRelationships = [
    {
      id: 'rel-001',
      person_id: 'char-001',
      person_type: 'character' as const,
      person_name: 'Alex',
      relationship_type: 'boyfriend',
      status: 'active',
      is_current: true,
      affection_score: 0.92,
      emotional_intensity: 0.88,
      compatibility_score: 0.95,
      relationship_health: 0.90,
      is_situationship: false,
      exclusivity_status: 'exclusive',
      strengths: [],
      weaknesses: [],
      pros: [],
      cons: [],
      red_flags: [],
      green_flags: [],
      start_date: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      rank_among_all: 1,
      rank_among_active: 1
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useMockData as any).mockReturnValue({
      useMockData: true
    });
    (getMockRomanticRelationshipsByFilter as any).mockReturnValue(mockRelationships);
  });

  it('renders love and relationships view', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText(/your love story/i)).toBeInTheDocument();
    });
  });

  it('displays relationships when loaded', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(<LoveAndRelationshipsView />);
    
    // Should show loading initially - the text is "Loading your love story..."
    expect(screen.getByText(/loading your love story/i)).toBeInTheDocument();
  });

  it('displays filter tabs', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Find tabs by role to avoid multiple matches
    const allTabs = screen.getAllByText(/all/i);
    const activeTabs = screen.getAllByText(/active/i);
    const pastTabs = screen.getAllByText(/past/i);
    const situationshipsTabs = screen.getAllByText(/situationships/i);
    const crushesTabs = screen.getAllByText(/crushes/i);
    const rankingsTabs = screen.getAllByText(/rankings/i);
    
    // Check that at least one tab exists for each filter
    expect(allTabs.length).toBeGreaterThan(0);
    expect(activeTabs.length).toBeGreaterThan(0);
    expect(pastTabs.length).toBeGreaterThan(0);
    expect(situationshipsTabs.length).toBeGreaterThan(0);
    expect(crushesTabs.length).toBeGreaterThan(0);
    expect(rankingsTabs.length).toBeGreaterThan(0);
  });

  it('filters relationships by active filter', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      // Initial load with 'all' filter
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('all');
    });
    
    // Clear previous calls
    vi.clearAllMocks();
    
    // Click active filter - find by role to avoid multiple matches
    const activeTabs = screen.getAllByText(/active/i);
    const activeTab = activeTabs.find(el => el.getAttribute('role') === 'tab' || el.closest('[role="tab"]')) || activeTabs[0];
    activeTab.click();
    
    await waitFor(() => {
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('active');
    });
  });

  it('shows search functionality', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText(/search relationships/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  it('displays relationship count', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText(/1 relationship/i)).toBeInTheDocument();
    });
  });

  it('shows mock data indicator when using mock data', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText(/mock data/i)).toBeInTheDocument();
    });
  });

  it('handles empty state when no relationships', async () => {
    (getMockRomanticRelationshipsByFilter as any).mockReturnValue([]);
    
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText(/no relationships found/i)).toBeInTheDocument();
    });
  });
});

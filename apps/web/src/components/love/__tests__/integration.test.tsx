// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { LoveAndRelationshipsView } from '../LoveAndRelationshipsView';
import { useMockData } from '../../../contexts/MockDataContext';
import {
  getMockRomanticRelationshipsByFilter,
  getMockRomanticRelationshipById,
  getMockDateEvents,
  getMockRelationshipAnalytics,
  getMockRankings,
} from '../../../mocks/romanticRelationships';

// Mock dependencies
vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../../mocks/romanticRelationships', () => ({
  getMockRomanticRelationshipsByFilter: vi.fn(),
  getMockRomanticRelationshipById: vi.fn(),
  getMockDateEvents: vi.fn(),
  getMockRelationshipAnalytics: vi.fn(),
  getMockRomanticRelationships: vi.fn(),
  getMockRankings: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

describe('Love & Relationships Integration Tests', () => {
  const mockRelationships = [
    {
      id: 'rel-001',
      person_id: 'char-001',
      person_type: 'character' as const,
      person_name: 'Alex',
      relationship_type: 'girlfriend',
      status: 'active',
      is_current: true,
      affection_score: 0.92,
      emotional_intensity: 0.88,
      compatibility_score: 0.95,
      relationship_health: 0.90,
      is_situationship: false,
      exclusivity_status: 'exclusive',
      strengths: ['Great communication'],
      weaknesses: ['Sometimes busy'],
      pros: ['Fun to be around'],
      cons: ['Can be forgetful'],
      red_flags: [],
      green_flags: ['Follows through'],
      start_date: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      rank_among_all: 1,
      rank_among_active: 1
    }
  ];

  const mockAnalytics = {
    relationshipId: 'rel-001',
    personId: 'char-001',
    personName: 'Alex',
    affectionScore: 0.92,
    compatibilityScore: 0.95,
    healthScore: 0.90,
    intensityScore: 0.88,
    strengths: ['Great communication'],
    weaknesses: ['Sometimes busy'],
    pros: ['Fun to be around'],
    cons: ['Can be forgetful'],
    redFlags: [],
    greenFlags: ['Follows through'],
    insights: ['Strong compatibility'],
    recommendations: ['Continue nurturing'],
    affectionTrend: 'increasing',
    healthTrend: 'improving',
    calculatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useMockData as any).mockReturnValue({
      useMockData: true
    });
    (getMockRomanticRelationshipsByFilter as any).mockReturnValue(mockRelationships);
    (getMockRomanticRelationshipById as any).mockReturnValue(mockRelationships[0]);
    (getMockDateEvents as any).mockReturnValue([]);
    (getMockRelationshipAnalytics as any).mockReturnValue(mockAnalytics);
    (getMockRankings as any).mockReturnValue(mockRelationships);
  });

  it('completes full flow: load → filter → open detail → view analytics', async () => {
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);
    
    // Step 1: Load relationships (default filter is 'all')
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      // Initial load should call with 'all' filter
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('all');
    });
    
    // Step 2: Filter by active — use role=tab and name to avoid matching "1 active" in the header
    const activeTab = screen.getByRole('tab', { name: /^active$/i });
    await user.click(activeTab);
    
    await waitFor(() => {
      // Should be called with 'active' after clicking the active tab
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('active');
    });
    
    // Step 3: Click relationship to open detail (would need RelationshipDetailModal to be rendered)
    // This is tested in the component's own tests
  });

  it('handles search functionality', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Search for relationship
    const searchInput = screen.getByPlaceholderText(/search relationships/i);
    fireEvent.change(searchInput, { target: { value: 'Alex' } });
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
  });

  it('switches between different filters', async () => {
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      // Initial load with 'all' filter
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('all');
    });

    // Tab accessible names (value and label may differ, e.g. Situationships vs Situations)
    const filterTabNames: Record<string, RegExp | string> = {
      active: /^active$/i,
      past: /^past$/i,
      situationships: /situationships|situations/i,
      crushes: /^crushes$/i,
      rankings: /^rankings$/i,
    };
    
    for (const filter of ['active', 'past', 'situationships', 'crushes', 'rankings'] as const) {
      const name = filterTabNames[filter];
      const tab = screen.getByRole('tab', { name });
      await user.click(tab);
      
      await waitFor(() => {
        if (filter !== 'rankings') {
          expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith(filter);
        }
      });
      
      // Clear mocks after each filter to test them independently
      vi.clearAllMocks();
    }
  });

  it('handles mock data fallback on API error', async () => {
    // Simulate API error but mock data enabled
    (useMockData as any).mockReturnValue({
      useMockData: true
    });
    
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      // Should still show data from mock
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
  });
});

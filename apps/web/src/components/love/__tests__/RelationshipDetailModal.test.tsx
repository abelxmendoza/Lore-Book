// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import { RelationshipDetailModal } from '../RelationshipDetailModal';
import { useMockData } from '../../../contexts/MockDataContext';
import { getMockRomanticRelationshipById, getMockDateEvents, getMockRelationshipAnalytics } from '../../../mocks/romanticRelationships';

// Mock dependencies
vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn()
}));

vi.mock('../../../mocks/romanticRelationships', () => ({
  getMockRomanticRelationshipById: vi.fn(),
  getMockDateEvents: vi.fn(),
  getMockRelationshipAnalytics: vi.fn()
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

describe('RelationshipDetailModal', () => {
  const mockRelationship = {
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
    strengths: ['Great communication'],
    weaknesses: ['Sometimes busy'],
    pros: ['Fun to be around'],
    cons: ['Can be forgetful'],
    red_flags: [],
    green_flags: ['Follows through'],
    start_date: '2024-01-01T00:00:00Z',
    end_date: undefined,
    created_at: '2024-01-01T00:00:00Z'
  };

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

  const mockDates = [
    {
      id: 'date-001',
      date_type: 'first_date',
      date_time: '2024-01-15T00:00:00Z',
      location: 'Coffee shop',
      description: 'First date',
      sentiment: 0.9,
      was_positive: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useMockData as any).mockReturnValue({
      useMockData: true
    });
    (getMockRomanticRelationshipById as any).mockReturnValue(mockRelationship);
    (getMockDateEvents as any).mockReturnValue(mockDates);
    (getMockRelationshipAnalytics as any).mockReturnValue(mockAnalytics);
  });

  it('renders modal when relationshipId is provided', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    expect(screen.getByText(/loading relationship/i)).toBeInTheDocument();
  });

  it('displays relationship tabs', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText(/overview/i)).toBeInTheDocument();
      expect(screen.getByText(/timeline/i)).toBeInTheDocument();
      expect(screen.getByText(/pros & cons/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics/i)).toBeInTheDocument();
      expect(screen.getByText(/chat/i)).toBeInTheDocument();
    });
  });

  it('displays relationship scores in overview', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('92%')).toBeInTheDocument(); // affection
      expect(screen.getByText('95%')).toBeInTheDocument(); // compatibility
      expect(screen.getByText('90%')).toBeInTheDocument(); // health
      expect(screen.getByText('88%')).toBeInTheDocument(); // intensity
    });
  });

  it('switches between tabs', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Click timeline tab
    const timelineTab = screen.getByText(/timeline/i);
    timelineTab.click();
    
    await waitFor(() => {
      // Should show timeline content
      expect(screen.getByText(/relationship period/i)).toBeInTheDocument();
    });
  });

  it('displays dates in timeline tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Click timeline tab
    const timelineTab = screen.getByText(/timeline/i);
    timelineTab.click();
    
    await waitFor(() => {
      expect(screen.getByText(/first date/i)).toBeInTheDocument();
    });
  });

  it('displays analytics in analytics tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Click analytics tab
    const analyticsTab = screen.getByText(/analytics/i);
    analyticsTab.click();
    
    await waitFor(() => {
      expect(screen.getByText(/relationship health dashboard/i)).toBeInTheDocument();
    });
  });

  it('displays pros and cons in pros-cons tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Click pros-cons tab
    const prosConsTab = screen.getByText(/pros & cons/i);
    prosConsTab.click();
    
    await waitFor(() => {
      expect(screen.getByText('Fun to be around')).toBeInTheDocument();
      expect(screen.getByText('Can be forgetful')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    // Find and click close button
    const closeButton = screen.getByLabelText(/close/i);
    closeButton.click();
    
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error state when relationship not found', async () => {
    (getMockRomanticRelationshipById as any).mockReturnValue(undefined);
    
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="invalid-id" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText(/relationship not found/i)).toBeInTheDocument();
    });
  });
});

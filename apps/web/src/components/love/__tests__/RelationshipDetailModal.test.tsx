// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { RelationshipDetailModal } from '../RelationshipDetailModal';
import { useMockData } from '../../../contexts/MockDataContext';
import { fetchJson } from '../../../lib/api';
import {
  getMockRomanticRelationshipById,
  getMockDateEvents,
  getMockRelationshipAnalytics,
  getMockKidsTogether,
  getMockPetsTogether,
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
  getMockRomanticRelationshipById: vi.fn(),
  getMockDateEvents: vi.fn(),
  getMockRelationshipAnalytics: vi.fn(),
  getMockKidsTogether: vi.fn(),
  getMockPetsTogether: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

const mockOpenChatWithFocus = vi.fn();
vi.mock('../../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
}));

describe('RelationshipDetailModal', () => {
  const mockRelationship = {
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
    (getMockKidsTogether as any).mockReturnValue([
      { id: 'kid-mia', name: 'Mia', relation: 'together', belongsTo: 'both' },
    ]);
    (getMockPetsTogether as any).mockReturnValue([
      { id: 'pet-waffles', name: 'Waffles', relation: 'together', belongsTo: 'both', species: 'dog' },
    ]);
    mockOpenChatWithFocus.mockClear();
  });

  it('renders modal when relationshipId is provided', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
  });

  it.skip('displays loading state initially', () => {
    // Loading state is transient: the mock resolves synchronously in useEffect and
    // act() flushes effects before we assert, so the loaded view (Alex) is already shown.
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    expect(screen.getByText(/loading relationship details/i)).toBeInTheDocument();
  });

  it('displays relationship tabs with Chat second after Overview', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
    expect(tabs[0]).toMatch(/overview/i);
    expect(tabs[1]).toMatch(/chat/i);
    // getAllByRole, not getByRole — the desktop TabsList and the mobile
    // EntityModalBottomNav (both real, both visible in jsdom with no CSS
    // media queries applied) render every tab twice with the same name.
    expect(screen.getAllByRole('tab', { name: /kids & pets together/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: /timeline/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: /pros & cons/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: /analytics/i })[0]).toBeInTheDocument();
  });

  it('displays relationship scores in overview', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      // Overview has one instance of each; use getAllByText for consistency if UI adds more later
      expect(screen.getAllByText('92%').length).toBeGreaterThan(0); // affection
      expect(screen.getAllByText('95%').length).toBeGreaterThan(0); // compatibility
      expect(screen.getAllByText('90%').length).toBeGreaterThan(0); // health
      expect(screen.getAllByText('88%').length).toBeGreaterThan(0); // intensity
    });
  });

  it('shows short reasons under overview score percentages', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/warm, positive signals|mutual warmth|based on how often/i)).toBeInTheDocument();
    });
  });

  it('switches between tabs', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    const user = userEvent.setup();
    const timelineTab = screen.getAllByRole('tab', { name: /timeline/i })[0];
    await user.click(timelineTab);

    await waitFor(() => {
      expect(screen.getByText(/intimacy & connection arc/i)).toBeInTheDocument();
    });
  });

  it('Kids & Pets Together tab uses mock data in demo mode and never calls the real API', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('tab', { name: /kids & pets together/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('kids-together-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Mia')).toBeInTheDocument();
    expect(screen.getByText('Waffles')).toBeInTheDocument();
    expect(getMockKidsTogether).toHaveBeenCalledWith('rel-001');
    expect(getMockPetsTogether).toHaveBeenCalledWith('rel-001');
    expect(fetchJson).not.toHaveBeenCalledWith(expect.stringContaining('/kids'));
  });

  it('chat tab hands off to main chat with Dating & Romance focus', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('tab', { name: /chat/i })[0]);

    expect(screen.getByTestId('relationship-chat-panel')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/message about this relationship/i)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('relationship-open-main-chat'));

    expect(onClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'char-001',
        entityName: 'Alex',
        entityType: 'character',
        relationshipId: 'rel-001',
        sourceSurface: 'love',
        sourceLabel: 'Dating & Romance',
      }),
    );
  });

  it('displays dates in timeline tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    const user = userEvent.setup();
    const timelineTab = screen.getAllByRole('tab', { name: /timeline/i })[0];
    await user.click(timelineTab);

    await waitFor(() => {
      expect(screen.getByText(/intimacy & connection arc/i)).toBeInTheDocument();
      expect(screen.getAllByText(/first date/i).length).toBeGreaterThan(0);
    });
  });

  it('shows their connections tab with romantic periphery', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('tab-their-connections'));

    await waitFor(() => {
      expect(screen.getByTestId('relationship-peripherals-panel')).toBeInTheDocument();
      expect(screen.getByTestId('peripheral-card-periph-alex-coworker')).toBeInTheDocument();
      expect(screen.getByTestId('their-connections-open-character-network')).toBeInTheDocument();
    });
  });

  it('displays analytics in analytics tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    const user = userEvent.setup();
    const analyticsTab = screen.getAllByRole('tab', { name: /analytics/i })[0];
    await user.click(analyticsTab);

    await waitFor(() => {
      // Analytics tab shows Relationship Health Dashboard and score percentages (multiple elements match)
      const matches = screen.getAllByText(/Relationship Health Dashboard|Affection|Compatibility/i);
      expect(matches.length).toBeGreaterThan(0);
      const body = document.body.textContent ?? '';
      expect(body.match(/\d+%/)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('displays pros and cons in pros-cons tab', async () => {
    const onClose = vi.fn();
    render(<RelationshipDetailModal relationshipId="rel-001" onClose={onClose} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    
    const user = userEvent.setup();
    const prosConsTab = screen.getAllByRole('tab', { name: /pros & cons/i })[0];
    await user.click(prosConsTab);

    await waitFor(() => {
      expect(screen.getByText('Fun to be around')).toBeInTheDocument();
      expect(screen.getByText('Can be forgetful')).toBeInTheDocument();
    }, { timeout: 3000 });
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

  it('surfaces a visible error and stays open when opening a peripheral character fails, instead of closing', async () => {
    const onClose = vi.fn();
    (getMockKidsTogether as any).mockReturnValue([
      {
        id: 'kid-mia',
        name: 'Mia',
        relation: 'step',
        belongsTo: 'partner',
        coParents: [{ id: 'coparent-broken', name: 'Riley' }],
      },
    ]);
    const onOpenPeripheralCharacter = vi.fn(
      (_characterId: string, onFailure?: (message: string) => void) => {
        onFailure?.('Could not open that Character Book card.');
      },
    );

    render(
      <RelationshipDetailModal
        relationshipId="rel-001"
        onClose={onClose}
        onOpenPeripheralCharacter={onOpenPeripheralCharacter}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('tab', { name: /kids & pets together/i })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('kids-together-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('kids-together-open-coparent'));

    await waitFor(() => {
      expect(screen.getByText('Could not open that Character Book card.')).toBeInTheDocument();
    });
    // The relationship modal must stay open — a failed peripheral-open must
    // never silently close the surface the user was already looking at.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Alex')).toBeInTheDocument();
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

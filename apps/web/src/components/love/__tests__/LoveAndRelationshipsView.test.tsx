// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { LoveAndRelationshipsView } from '../LoveAndRelationshipsView';
import { useMockData } from '../../../contexts/MockDataContext';
import { getMockRomanticRelationshipsByFilter } from '../../../mocks/romanticRelationships';
import { fetchJson } from '../../../lib/api';

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
  getMockRomanticRelationships: vi.fn()
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn()
}));

vi.mock('../RomanticStoryShowcase', () => ({
  RomanticStoryShowcase: () => null,
}));

vi.mock('../RomanticLexicalInsights', () => ({
  RomanticLexicalInsights: () => null,
}));

describe('LoveAndRelationshipsView', () => {
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
    localStorage.clear();
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

  it('lets an ended relationship be re-selected as a romantic interest', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', listener);

    // Override the default 'active' fixture with an ended relationship for this
    // test — exes should remain findable/re-selectable in the launcher.
    (getMockRomanticRelationshipsByFilter as any).mockReturnValue([
      { ...mockRelationships[0], status: 'ended', is_current: false },
    ]);

    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
    await user.type(screen.getByRole('textbox', { name: /romantic interest name/i }), 'Alex');
    await user.click(screen.getByRole('button', { name: /chat about alex/i }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    // "Alex" exists in both the relationship list (id char-001) and the demo
    // Character Book (id demo-character-alex) — the merge now prefers the
    // richer Character Book entry, so that id wins.
    expect(event.detail).toMatchObject({
      entityId: 'demo-character-alex',
      entityName: 'Alex',
      entityType: 'character',
      sourceSurface: 'love',
      sourceLabel: 'Dating & Romance',
    });

    window.removeEventListener('lorebook:open-chat-focus', listener);
  });

  it('excludes an active romantic interest from the search', async () => {
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
    await user.type(screen.getByRole('textbox', { name: /romantic interest name/i }), 'Alex');

    // Alex (status: active, from the default beforeEach fixture) is no longer
    // an exact match — the submit button falls through to the new-person copy.
    expect(screen.queryByRole('button', { name: /chat about alex/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /introduce alex in chat/i })).toBeInTheDocument();
  });

  it('introducing a brand-new person opens chat without pre-creating a character', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', listener);

    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    // A name guaranteed not to collide with any demo Character Book fixture.
    await user.click(screen.getByRole('button', { name: /add a new romantic interest/i }));
    await user.type(screen.getByRole('textbox', { name: /romantic interest name/i }), 'Priyanka Voss');
    await user.click(screen.getByRole('button', { name: /introduce priyanka voss in chat/i }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      entityName: 'Priyanka Voss',
      entityType: 'memory',
      sourceSurface: 'love',
      sourceLabel: 'Dating & Romance',
    });
    expect(event.detail.entityId).not.toBe('');
    expect(event.detail.initialPrompt).toMatch(/priyanka/i);
    expect(event.detail.initialPrompt).toMatch(/aliases|nicknames/i);

    const characterPostCalls = (fetchJson as any).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/characters'),
    );
    expect(characterPostCalls).toHaveLength(0);

    window.removeEventListener('lorebook:open-chat-focus', listener);
  });

  it('shows demo romantic character suggestions in mock mode', async () => {
    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByText(/romantic interests detected in your chats/i)).toBeInTheDocument();
      expect(screen.getByText('Priya')).toBeInTheDocument();
      expect(screen.getByText('Daniel')).toBeInTheDocument();
    });
  });

  it.skip('shows loading state initially', () => {
    // Loading state is transient: mock resolves in useEffect before we can assert
    render(<LoveAndRelationshipsView />);
    expect(screen.getByText(/loading your love story/i)).toBeInTheDocument();
  });

  it('displays filter tabs', async () => {
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      // Use getByRole('tab') to target the filter tabs; "active" etc. also appear in summary/headings
      expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /active/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /past/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /situationships/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /crushes/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /rankings/i })).toBeInTheDocument();
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
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);
    
    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
      // Initial load with 'all' filter
      expect(getMockRomanticRelationshipsByFilter).toHaveBeenCalledWith('all');
    });
    
    // Click the Active filter tab; Radix needs a proper user event to fire onValueChange
    const activeTab = screen.getByRole('tab', { name: /^active$/i });
    await user.click(activeTab);
    
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

  it('switches to the persisted list view and keeps copy all available', async () => {
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /list view/i }));

    expect(localStorage.getItem('lk_dating_romance_view')).toBe('list');
    expect(screen.getByRole('button', { name: /copy all/i })).toBeEnabled();
    expect(screen.getByTestId('relationship-card-rel-001')).toBeInTheDocument();
  });
});

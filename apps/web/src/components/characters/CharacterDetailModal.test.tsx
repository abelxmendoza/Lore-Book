// =====================================================
// CHARACTER DETAIL MODAL TESTS
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterDetailModal } from './CharacterDetailModal';
import type { Character } from './CharacterProfileCard';

// Mock dependencies
vi.mock('../../features/chat/composer/ChatComposer', () => ({
  ChatComposer: () => <div data-testid="chat-composer">Chat Composer</div>,
}));

vi.mock('../../lib/api', () => ({
  // Reject by default so the component's catch blocks preserve the initial character state.
  // Individual tests can override with vi.mocked(fetchJson).mockResolvedValue(...).
  fetchJson: vi.fn().mockRejectedValue(new Error('Not found')),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

const mockCharacter: Character = {
  id: 'char-1',
  name: 'John Doe',
  user_id: 'user-1',
  alias: [],
  pronouns: null,
  archetype: null,
  role: 'Friend',
  status: 'active',
  first_appearance: null,
  summary: 'A test character',
  tags: [],
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CharacterDetailModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render character information', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should display character name', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display all tabs', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Actual tab labels: Info, Intelligence, What I Know, Chat, Connections, History, Insights, Perceptions, Social, Metadata
    expect(screen.getByText(/^info$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^social$/i)).toBeInTheDocument();
    expect(screen.getByText(/^connections$/i)).toBeInTheDocument();
  });

  it('should show chat composer when Chat tab is active', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Switch to the Chat tab (composer only renders on the chat tab).
    // Tabs are plain <button> elements; find by the visible label text.
    const chatTab = screen.getByText(/^chat$/i).closest('button')!;
    await user.click(chatTab);

    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
  });

  it('should handle character with no data gracefully', () => {
    const emptyCharacter: Character = {
      ...mockCharacter,
      name: 'Unknown',
      summary: undefined,
      role: undefined,
    };

    render(
      <CharacterDetailModal
        character={emptyCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Should still render without crashing — check for Info tab (default)
    expect(screen.getByText(/^info$/i)).toBeInTheDocument();
  });

  describe('distant but high impact', () => {
    it('shows "Rare in story, high impact on you" when minor and character_influence_on_user >= 70', () => {
      const highImpactMinor: Character = {
        ...mockCharacter,
        name: 'Distant Crush',
        importance_level: 'minor',
        analytics: {
          closeness_score: 40,
          relationship_depth: 40,
          interaction_frequency: 25,
          recency_score: 50,
          character_influence_on_user: 78,
          user_influence_over_character: 20,
          importance_score: 30,
          priority_score: 50,
          relevance_score: 60,
          value_score: 70,
          sentiment_score: 60,
          trust_score: 50,
          support_score: 50,
          conflict_score: 10,
          engagement_score: 40,
          activity_level: 30,
          shared_experiences: 5,
          relationship_duration_days: 90,
          trend: 'stable',
        },
      };

      render(
        <CharacterDetailModal
          character={highImpactMinor}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText(/Rare in story, high impact on you/i)).toBeInTheDocument();
    });

    it('shows high-impact callout in Importance section when background + influence >= 70', async () => {
      const highImpactBackground: Character = {
        ...mockCharacter,
        name: 'Background Idol',
        importance_level: 'background',
        analytics: {
          closeness_score: 20,
          relationship_depth: 20,
          interaction_frequency: 10,
          recency_score: 30,
          character_influence_on_user: 85,
          user_influence_over_character: 5,
          importance_score: 15,
          priority_score: 40,
          relevance_score: 50,
          value_score: 65,
          sentiment_score: 70,
          trust_score: 40,
          support_score: 50,
          conflict_score: 5,
          engagement_score: 35,
          activity_level: 20,
          shared_experiences: 2,
          relationship_duration_days: 60,
          trend: 'stable',
        },
      };

      render(
        <CharacterDetailModal
          character={highImpactBackground}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      // Importance section appears after loadingDetails becomes false; wait for callout text
      await waitFor(() => {
        const callout = screen.getByText(/they shape your choices and thoughts even with limited presence/i);
        expect(callout).toBeInTheDocument();
        expect(callout.closest('p')).toHaveTextContent(/Rare in your story, but high impact on you/i);
      }, { timeout: 3000 });
    });

    it('does not show rare-in-story badge when major even with high influence', () => {
      const majorHighInfluence: Character = {
        ...mockCharacter,
        name: 'Major Player',
        importance_level: 'major',
        analytics: {
          closeness_score: 80,
          relationship_depth: 80,
          interaction_frequency: 75,
          recency_score: 80,
          character_influence_on_user: 90,
          user_influence_over_character: 70,
          importance_score: 88,
          priority_score: 85,
          relevance_score: 90,
          value_score: 85,
          sentiment_score: 75,
          trust_score: 85,
          support_score: 80,
          conflict_score: 15,
          engagement_score: 85,
          activity_level: 80,
          shared_experiences: 25,
          relationship_duration_days: 365,
          trend: 'deepening',
        },
      };

      render(
        <CharacterDetailModal
          character={majorHighInfluence}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByText(/Rare in story, high impact on you/i)).not.toBeInTheDocument();
    });
  });
});

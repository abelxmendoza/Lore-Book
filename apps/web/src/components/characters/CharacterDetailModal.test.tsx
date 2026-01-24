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
  fetchJson: vi.fn(),
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

    expect(screen.getByText(/info/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/social media/i)).toBeInTheDocument();
    expect(screen.getByText(/connections/i)).toBeInTheDocument();
  });

  it('should show chat composer at bottom', () => {
    render(
      <CharacterDetailModal
        character={mockCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
  });

  it('should handle character with no data gracefully', () => {
    const emptyCharacter: Character = {
      ...mockCharacter,
      name: '',
      summary: null,
      role: null,
    };

    render(
      <CharacterDetailModal
        character={emptyCharacter}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Should still render without crashing
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
  });
});

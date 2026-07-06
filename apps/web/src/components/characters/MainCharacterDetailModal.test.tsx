import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainCharacterDetailModal } from './MainCharacterDetailModal';
import type { Character } from './CharacterProfileCard';

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error('Not found')),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: true }),
  getGlobalMockDataEnabled: () => true,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('./CharacterTimelinePanel', () => ({
  CharacterTimelinePanel: () => <div data-testid="timeline-panel">Timeline</div>,
}));

vi.mock('./CharacterKnowledgeBase', () => ({
  CharacterKnowledgeBase: () => <div data-testid="knowledge-base">Knowledge</div>,
}));

vi.mock('./CharacterDetailModal', () => ({
  CharacterDetailModal: () => <div data-testid="nested-character-modal">Nested</div>,
}));

const mainCharacter: Character = {
  id: 'self-synthetic',
  name: 'Alex Rivera',
  role: 'Main Character',
  archetype: 'protagonist',
  importance_level: 'protagonist',
  status: 'active',
  summary: 'The protagonist of your story.',
  tags: ['your story'],
  metadata: { is_self: true, is_user: true },
};

describe('MainCharacterDetailModal', () => {
  const onClose = vi.fn();
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders protagonist shell with distinct test id and hero content', async () => {
    render(
      <MainCharacterDetailModal
        character={mainCharacter}
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByTestId('main-character-modal')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2, name: 'You' }).length).toBeGreaterThan(0);
    // Name renders in both the hero and the editable identity section.
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0);
    expect(screen.getByText(/Your personal profile/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Your messages')).toBeInTheDocument();
    });
  });

  it('shows user-priority tabs distinct from generic character modal', () => {
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    expect(screen.getByTestId('main-tab-story')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-people')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-lore')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-memories')).toBeInTheDocument();
    expect(screen.getByTestId('main-tab-chat')).toBeInTheDocument();
  });

  it('navigates to chat tab and offers talk-to-lore starters', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('main-tab-chat'));
    expect(screen.getByText(/Open main chat/i)).toBeInTheDocument();
    expect(screen.getByText(/What's Lore learned about me lately/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MainCharacterDetailModal character={mainCharacter} onClose={onClose} />,
    );

    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

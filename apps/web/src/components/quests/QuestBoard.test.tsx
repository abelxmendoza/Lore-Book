import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { QuestBoard as QuestBoardData } from '../../types/quest';

const mockRefetch = vi.fn();
const mockUseQuestBoard = vi.fn();

vi.mock('../../hooks/useQuests', () => ({
  useQuestBoard: () => mockUseQuestBoard(),
  useStartQuest: () => ({ mutateAsync: vi.fn() }),
  useCompleteQuest: () => ({ mutateAsync: vi.fn() }),
  usePauseQuest: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('./DetectedQuestSuggestions', () => ({
  DetectedQuestSuggestions: () => <div data-testid="quest-suggestions-stub" />,
}));

vi.mock('./QuestDetailPanel', () => ({
  QuestDetailPanel: ({ questId }: { questId: string | null }) => (
    <div data-testid="quest-detail-panel">{questId ?? 'none'}</div>
  ),
}));

import { QuestBoard } from './QuestBoard';

const sampleBoard: QuestBoardData = {
  todays_quests: [],
  this_weeks_quests: [],
  main_quests: [
    {
      id: 'q1',
      title: 'Launch MVP',
      description: 'Ship the first version of the product',
      quest_type: 'main',
      status: 'active',
      priority: 8,
      importance: 9,
      impact: 8,
      progress_percentage: 35,
      source: 'extracted',
      user_id: 'u1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  side_quests: [
    {
      id: 'q2',
      title: 'Learn guitar basics',
      quest_type: 'side',
      status: 'paused',
      priority: 5,
      importance: 6,
      impact: 5,
      progress_percentage: 10,
      user_id: 'u1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  daily_quests: [],
  completed_quests: [],
  total_count: 2,
};

function renderBoard() {
  return render(
    <MemoryRouter>
      <div className="flex h-[640px] min-h-0 flex-col overflow-hidden">
        <QuestBoard />
      </div>
    </MemoryRouter>
  );
}

describe('QuestBoard layout and error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
  });

  it('shows loading state', () => {
    mockUseQuestBoard.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    renderBoard();
    expect(screen.getByTestId('quest-board-loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading your quest log/i)).toBeInTheDocument();
  });

  it('shows full-page error with retry when load fails and board is empty', () => {
    mockUseQuestBoard.mockReturnValue({
      data: null,
      isLoading: false,
      error: 'Backend server is not running',
      refetch: mockRefetch,
    });

    renderBoard();
    expect(screen.getByTestId('quest-board-error')).toBeInTheDocument();
    expect(screen.getByText('Backend server is not running')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders quest list inside a scrollable pane with proper shell height', async () => {
    mockUseQuestBoard.mockReturnValue({
      data: sampleBoard,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('quest-board')).toBeInTheDocument();
    });

    const shell = screen.getByTestId('quest-board');
    expect(shell.className).toMatch(/h-full/);
    expect(shell.className).toMatch(/min-h-0/);
    expect(shell.className).toMatch(/overflow-hidden/);

    const body = screen.getByTestId('quest-board-body');
    expect(body.className).toMatch(/flex-1/);
    expect(body.className).toMatch(/min-h-0/);

    const list = screen.getByTestId('quest-board-list');
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/flex-1/);

    const nav = screen.getByTestId('quest-category-nav');
    expect(nav.querySelector('ul')).toBeTruthy();
    expect(nav.querySelector('ul')?.className).toMatch(/grid/);
    expect(nav.className).not.toMatch(/overflow-x-auto/);
    expect(screen.getAllByTestId(/^quest-tab-/).length).toBe(6);
    expect(screen.getByTestId('quest-list-heading')).toHaveTextContent('In progress');

    const suggestions = screen.getByTestId('quest-board-suggestions');
    expect(
      suggestions.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(screen.getByText('Launch MVP')).toBeInTheDocument();
    expect(screen.getByText('Learn guitar basics')).toBeInTheDocument();
    expect(screen.getByTestId('quest-board-detail-pane')).toHaveTextContent('q1');
  });

  it('shows inline error banner when stale data exists but refresh failed', () => {
    mockUseQuestBoard.mockReturnValue({
      data: sampleBoard,
      isLoading: false,
      error: 'Network timeout',
      refetch: mockRefetch,
    });

    renderBoard();
    expect(screen.getByTestId('quest-board-error-banner')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    expect(screen.getByText('Launch MVP')).toBeInTheDocument();
  });

  it('filters quests by category tab', async () => {
    mockUseQuestBoard.mockReturnValue({
      data: sampleBoard,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Launch MVP')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('quest-tab-side'));
    expect(screen.queryByText('Launch MVP')).not.toBeInTheDocument();
    expect(screen.getByText('Learn guitar basics')).toBeInTheDocument();
  });
});

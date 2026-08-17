import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Quest } from '../../types/quest';

const mockOpenChatWithFocus = vi.fn();
const mockMutateAsync = vi.fn();

const quest: Quest = {
  id: 'quest-1',
  title: 'Ship the Quest Log',
  description: 'Make quest planning clear and useful.',
  quest_type: 'main',
  status: 'active',
  priority: 9,
  importance: 9,
  impact: 8,
  progress_percentage: 40,
  source: 'manual',
  milestones: [
    {
      id: 'milestone-1',
      description: 'Build the quest detail tabs',
      achieved: false,
    },
  ],
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-12T12:00:00.000Z',
};

vi.mock('../../hooks/useQuests', () => ({
  useQuest: () => ({ data: quest, isLoading: false }),
  useQuestHistory: () => ({
    data: [
      {
        id: 'history-1',
        event_type: 'progress_updated',
        description: 'Progress moved forward.',
        created_at: '2026-08-12T12:00:00.000Z',
      },
    ],
    isLoading: false,
  }),
  useUpdateQuestProgress: () => ({ mutateAsync: mockMutateAsync }),
  useStartQuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  usePauseQuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useCompleteQuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useAbandonQuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
}));

import { QuestDetailPanel } from './QuestDetailPanel';

describe('QuestDetailPanel tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('organizes quest information into overview, progress, and activity tabs', () => {
    render(<QuestDetailPanel questId={quest.id} />);

    expect(screen.getByRole('tablist', { name: 'Quest details' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(quest.description!)).toBeInTheDocument();
    expect(screen.queryByText('Build the quest detail tabs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    expect(screen.getByText('Quest progress')).toBeInTheDocument();
    expect(screen.getByText('Build the quest detail tabs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Progress moved forward.')).toBeInTheDocument();
  });

  it('opens main chat with the canonical quest focused and requests the first response', () => {
    const onClose = vi.fn();
    render(<QuestDetailPanel questId={quest.id} onClose={onClose} mobile embedded />);

    fireEvent.click(screen.getByRole('tab', { name: 'Focus Chat' }));
    expect(screen.getByText('Focus this quest in main chat')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('quest-open-focus-chat'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(expect.objectContaining({
      entityId: quest.id,
      entityName: quest.title,
      entityType: 'quest',
      sourceSurface: 'quests',
      sourceLabel: 'Quest Log',
      autoSubmit: true,
      startNewThread: true,
    }));
  });
});

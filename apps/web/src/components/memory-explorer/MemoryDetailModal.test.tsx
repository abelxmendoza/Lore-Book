import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../test/utils';
import type { MemoryCard } from '../../types/memory';

import { MemoryDetailModal } from './MemoryDetailModal';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: () => true,
}));

vi.mock('../lorebook/EntityLorebookCompileControl', () => ({
  EntityLorebookCompileControl: () => <div data-testid="mock-lorebook-meter" />,
}));

vi.mock('./MemoryComponents', () => ({ MemoryComponents: () => null }));
vi.mock('../graph/KnowledgeGraphViewer', () => ({ KnowledgeGraphViewer: () => null }));
vi.mock('../reactions/ReactionList', () => ({ ReactionList: () => null }));

const memory: MemoryCard = {
  id: 'mock-mem-mission-first-visit',
  title: 'First visit to Mission Climbing Gym',
  content: 'Tried the gym for the first time.',
  date: '2026-04-04T18:42:00.000Z',
  tags: ['climbing'],
  source: 'manual',
  sourceIcon: '📖',
  characters: [],
};

describe('MemoryDetailModal main chat handoff', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces embedded chat with a response-first focused handoff', async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    render(<MemoryDetailModal memory={memory} onClose={onClose} />);

    expect(screen.queryByRole('button', { name: /^chat$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Chat about this Memory')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('memory-open-main-chat'));

    const handoff = dispatch.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'lorebook:open-chat-focus') as CustomEvent;

    expect(handoff.detail).toMatchObject({
      entityId: memory.id,
      entityName: memory.title,
      entityType: 'memory',
      sourceSurface: 'lorebook',
      sourceLabel: 'Memory Explorer',
      autoSubmit: true,
      startNewThread: true,
    });
    expect(handoff.detail.initialPrompt).toMatch(/start by giving me a grounded response/i);
    expect(handoff.detail.initialPrompt).toMatch(/invite me to add or correct context/i);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

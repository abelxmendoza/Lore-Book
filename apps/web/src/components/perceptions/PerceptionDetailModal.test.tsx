import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../test/utils';
import type { PerceptionEntry } from '../../types/perception';

import { PerceptionDetailModal } from './PerceptionDetailModal';

vi.mock('../reactions/ReactionList', () => ({ ReactionList: () => null }));
vi.mock('./PerceptionEvolutionTimeline', () => ({ PerceptionEvolutionTimeline: () => null }));

const perception: PerceptionEntry = {
  id: 'perception-1',
  user_id: 'synthetic-user',
  subject_alias: 'Jamie',
  content: 'I believed Jamie was avoiding the group.',
  source: 'intuition',
  confidence_level: 0.35,
  timestamp_heard: '2026-07-20T12:00:00.000Z',
  impact_on_me: 'I became more guarded.',
  status: 'unverified',
  retracted: false,
  created_at: '2026-07-20T12:00:00.000Z',
  updated_at: '2026-07-20T12:00:00.000Z',
};

describe('PerceptionDetailModal main chat handoff', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces embedded chat with a response-first perception focus button', async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    render(<PerceptionDetailModal perception={perception} onClose={onClose} />);

    expect(screen.queryByRole('button', { name: /^chat$/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/tell your story/i)).not.toBeInTheDocument();
    expect(screen.getByText('Certainty')).toBeInTheDocument();
    expect(screen.queryByText('Confidence')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('perception-open-main-chat'));

    const handoff = dispatch.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'lorebook:open-chat-focus') as CustomEvent;

    expect(handoff.detail).toMatchObject({
      entityId: perception.id,
      entityName: 'Perception about Jamie',
      entityType: 'perception',
      sourceSurface: 'perceptions',
      sourceLabel: 'Perception Book',
      autoSubmit: true,
      startNewThread: true,
    });
    expect(handoff.detail.initialPrompt).toMatch(/not an objective fact/i);
    expect(handoff.detail.initialPrompt).toMatch(/clarify, resolve, or retract/i);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

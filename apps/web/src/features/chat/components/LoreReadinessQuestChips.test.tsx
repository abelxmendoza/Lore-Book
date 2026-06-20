import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LoreReadinessQuestChips } from './LoreReadinessQuestChips';
import { resetLoreReadinessQuestsDismissed } from '../../../hooks/useLoreReadinessQuestsDismiss';

vi.mock('../../../hooks/useLoreReadinessQuests', () => ({
  useLoreReadinessQuests: () => ({
    loading: false,
    quests: [
      {
        id: 'demo-career',
        topicId: 'professional',
        label: 'Career & work',
        prompt: 'Tell me about your first real job — what you learned and how it changed you.',
        progress: 0.55,
      },
      {
        id: 'demo-family',
        topicId: 'family',
        label: 'Family',
        prompt: 'Share a memory from home that still shapes who you are today.',
        progress: 0.4,
      },
    ],
  }),
}));

describe('LoreReadinessQuestChips', () => {
  beforeEach(() => {
    resetLoreReadinessQuestsDismissed();
  });

  it('renders quest suggestions', () => {
    render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);
    expect(screen.getByText('Fill knowledge gaps for lorebooks')).toBeInTheDocument();
    expect(screen.getByText(/Career & work · 55%/)).toBeInTheDocument();
  });

  it('can be dismissed with the close button', async () => {
    const user = userEvent.setup();
    render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);

    expect(screen.getByTestId('lore-readiness-quests-dismiss')).toBeInTheDocument();
    await user.click(screen.getByTestId('lore-readiness-quests-dismiss'));

    expect(screen.queryByText('Fill knowledge gaps for lorebooks')).not.toBeInTheDocument();
  });

  it('stays dismissed across remounts in the same session', async () => {
    const user = userEvent.setup();
    const first = render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);
    await user.click(screen.getByTestId('lore-readiness-quests-dismiss'));
    first.unmount();

    render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);
    expect(screen.queryByText('Fill knowledge gaps for lorebooks')).not.toBeInTheDocument();
  });

  it('can collapse and expand quest suggestions', async () => {
    const user = userEvent.setup();
    render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);

    expect(screen.getByText(/Career & work · 55%/)).toBeInTheDocument();

    await user.click(screen.getByTestId('lore-readiness-quests-toggle'));
    expect(screen.queryByText(/Career & work · 55%/)).not.toBeInTheDocument();
    expect(screen.getByText('Fill knowledge gaps for lorebooks')).toBeInTheDocument();

    await user.click(screen.getByTestId('lore-readiness-quests-toggle'));
    expect(screen.getByText(/Career & work · 55%/)).toBeInTheDocument();
  });

  it('stays collapsed across remounts in the same session', async () => {
    const user = userEvent.setup();
    const first = render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);
    await user.click(screen.getByTestId('lore-readiness-quests-toggle'));
    first.unmount();

    render(<LoreReadinessQuestChips onSelectPrompt={vi.fn()} />);
    expect(screen.queryByText(/Career & work · 55%/)).not.toBeInTheDocument();
    expect(screen.getByText('Fill knowledge gaps for lorebooks')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetectedSkillSuggestions } from './DetectedSkillSuggestions';
import { MOCK_SKILL_BOOK_NAMES } from '../../mocks/skillSuggestions';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

vi.mock('../../hooks/useSuggestionRescan', () => ({
  useSuggestionRescan: () => ({
    rescan: vi.fn(),
    rescanning: false,
    RescanToastContainer: null,
  }),
}));

vi.mock('../../api/skills', () => ({
  skillsApi: {
    getSuggestions: vi.fn().mockResolvedValue([]),
    materializeSuggestion: vi.fn(),
  },
}));

describe('DetectedSkillSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a suggestion modal with the full card contents in demo mode', async () => {
    const user = userEvent.setup();

    render(
      <DetectedSkillSuggestions
        demoMode
        existingSkillNames={MOCK_SKILL_BOOK_NAMES}
      />,
    );

    expect(screen.getByText(/Skills detected in your story/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open React suggestion' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'React' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Skill suggestion/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Building the fictional Atlas Notes app in React and TypeScript/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Working on the Atlas Notes frontend in React/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add React' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close suggestion' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

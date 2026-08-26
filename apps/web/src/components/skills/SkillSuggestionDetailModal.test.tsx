import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SkillSuggestion } from '../../api/skills';
import { SkillSuggestionDetailModal } from './SkillSuggestionDetailModal';

const similar: SkillSuggestion = {
  id: 'sug-frontend',
  skill_name: 'Frontend Development',
  skill_category: 'technical',
  confidence: 0.9,
  match_status: 'similar',
  matched_book_id: 'skill-frontend',
  matched_book_name: 'Front-End Development',
  description: 'Building user-facing web apps.',
};

describe('SkillSuggestionDetailModal', () => {
  it('lets the user merge into the suggested skill, pick another, or keep it separate', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onMerge = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SkillSuggestionDetailModal
        suggestion={similar}
        bookEntries={[
          { id: 'skill-frontend', name: 'Front-End Development' },
          { id: 'skill-debug', name: 'Software Debugging' },
        ]}
        onClose={() => {}}
        onAdd={onAdd}
        onMerge={onMerge}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('button', { name: /Keep Frontend Development as its own skill/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Merge with Front-End Development/i }));
    expect(onMerge).toHaveBeenCalledWith(similar, {
      id: 'skill-frontend',
      name: 'Front-End Development',
    });

    await user.type(screen.getByPlaceholderText(/Search skills to merge with/i), 'debug');
    await user.click(screen.getByRole('button', { name: /Software Debugging/i }));
    expect(onMerge).toHaveBeenCalledWith(similar, {
      id: 'skill-debug',
      name: 'Software Debugging',
    });

    await user.click(screen.getByRole('button', { name: /Keep Frontend Development as its own skill/i }));
    expect(onAdd).toHaveBeenCalledWith(similar);
  });
});

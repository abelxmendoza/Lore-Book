import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupSuggestions } from './GroupSuggestions';

describe('GroupSuggestions', () => {
  it('opens a preview organization modal when a detected group name is clicked', async () => {
    const user = userEvent.setup();
    const onOpenCandidate = vi.fn();

    render(
      <GroupSuggestions
        demoMode
        onOpenCandidate={onOpenCandidate}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Whitmore-Chen Family suggestion' }));

    expect(onOpenCandidate).toHaveBeenCalledTimes(1);
    const preview = onOpenCandidate.mock.calls[0]![0];
    expect(preview.name).toBe('Whitmore-Chen Family');
    expect(preview.id).toBe('candidate-demo-group-whitmore-chen');
    expect(preview.metadata?.preview_candidate).toBe(true);
    expect(preview.metadata?.group_candidate_id).toBe('demo-group-whitmore-chen');
    expect(preview.members?.map((m: { character_name: string }) => m.character_name)).toEqual(
      expect.arrayContaining(['Aunt Maribel', 'Nico', 'Nana Elena']),
    );
  });
});

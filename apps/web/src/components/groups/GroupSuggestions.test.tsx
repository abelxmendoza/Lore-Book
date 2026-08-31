import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupSuggestions } from './GroupSuggestions';

describe('GroupSuggestions', () => {
  it('opens a suggestion review dialog instead of the Groups book modal', async () => {
    const user = userEvent.setup();

    render(<GroupSuggestions demoMode />);

    await user.click(screen.getByRole('button', { name: 'Open Whitmore-Chen Family suggestion' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Whitmore-Chen Family' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Group suggestion/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Aunt Maribel, Nico, and Nana Elena keep appearing/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create Whitmore-Chen Family' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Overview')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Timeline')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close suggestion' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

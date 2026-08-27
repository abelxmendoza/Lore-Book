import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PERSON_DISMISS_REASONS, SuggestionDismissButton } from './SuggestionDismissButton';

describe('SuggestionDismissButton', () => {
  it('shows the generic entity reasons by default', async () => {
    const user = userEvent.setup();
    render(<SuggestionDismissButton onDismiss={vi.fn()} />);

    await user.click(screen.getByLabelText('Dismiss'));

    expect(screen.getByRole('menuitem', { name: /wrong book/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /just noise/i })).toBeInTheDocument();
  });

  it('shows overridden reasons when provided, replacing the defaults', async () => {
    const user = userEvent.setup();
    render(<SuggestionDismissButton onDismiss={vi.fn()} reasons={PERSON_DISMISS_REASONS} />);

    await user.click(screen.getByLabelText('Dismiss'));

    expect(screen.getByRole('menuitem', { name: /not a real person/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /this is an error/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /wrong book/i })).not.toBeInTheDocument();
  });

  it('calls onDismiss with the selected reason value', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestionDismissButton onDismiss={onDismiss} reasons={PERSON_DISMISS_REASONS} />);

    await user.click(screen.getByLabelText('Dismiss'));
    await user.click(screen.getByRole('menuitem', { name: /not a real person/i }));

    expect(onDismiss).toHaveBeenCalledWith('not_a_person');
  });

  it('calls onDismiss with no reason for the plain dismiss option', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestionDismissButton onDismiss={onDismiss} />);

    await user.click(screen.getByLabelText('Dismiss'));
    await user.click(screen.getByRole('menuitem', { name: /^Dismiss/ }));

    expect(onDismiss).toHaveBeenCalledWith();
  });
});

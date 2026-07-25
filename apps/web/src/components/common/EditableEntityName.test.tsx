import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditableEntityName } from './EditableEntityName';

describe('EditableEntityName', () => {
  it('shows a "Saved" confirmation after a successful rename', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableEntityName name="Amazon" onSave={onSave} label="organization name" />);

    fireEvent.click(screen.getByRole('button', { name: /edit organization name/i }));
    const input = screen.getByRole('textbox', { name: /edit organization name/i });
    fireEvent.change(input, { target: { value: 'Amazon Ring' } });
    fireEvent.click(screen.getByRole('button', { name: /save organization name/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Amazon Ring'));
    expect(await screen.findByTestId('editable-entity-name-saved')).toBeInTheDocument();
  });

  it('shows an inline error and keeps editing open on failure, with no "Saved" confirmation', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Could not rename'));
    render(<EditableEntityName name="Amazon" onSave={onSave} label="organization name" />);

    fireEvent.click(screen.getByRole('button', { name: /edit organization name/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /edit organization name/i }), {
      target: { value: 'Amazon Ring' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save organization name/i }));

    expect(await screen.findByText('Could not rename')).toBeInTheDocument();
    expect(screen.queryByTestId('editable-entity-name-saved')).not.toBeInTheDocument();
    // Still editing — the input is still on screen.
    expect(screen.getByRole('textbox', { name: /edit organization name/i })).toBeInTheDocument();
  });

  it('does not call onSave or show a rename affordance when disabled', () => {
    const onSave = vi.fn();
    render(<EditableEntityName name="Amazon" onSave={onSave} disabled />);
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit name/i })).not.toBeInTheDocument();
  });
});

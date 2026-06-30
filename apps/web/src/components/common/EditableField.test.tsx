import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { EditableField } from './EditableField';
import { toFieldSource } from './FieldSourceBadge';

describe('toFieldSource', () => {
  it('maps stored sources to badge states', () => {
    expect(toFieldSource('user_confirmed', true)).toBe('confirmed');
    expect(toFieldSource(undefined, true)).toBe('auto');
    expect(toFieldSource(undefined, false)).toBe('unknown');
  });
});

describe('EditableField', () => {
  it('shows the value and a provenance badge', () => {
    render(<EditableField label="Work" value="Engineer" source="auto" onSave={vi.fn()} />);
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByTestId('field-source-auto')).toBeInTheDocument();
  });

  it('shows the empty hint when there is no value', () => {
    render(<EditableField label="Work" value="" source="unknown" emptyHint="Ask in chat" onSave={vi.fn()} />);
    expect(screen.getByText('Ask in chat')).toBeInTheDocument();
  });

  it('edits and saves a text value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableField label="Work" value="Engineer" source="auto" onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Work' }));
    const input = screen.getByRole('textbox', { name: 'Edit Work' });
    fireEvent.change(input, { target: { value: 'Designer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Work' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Designer'));
  });

  it('does not call onSave when the value is unchanged', async () => {
    const onSave = vi.fn();
    render(<EditableField label="Work" value="Engineer" source="confirmed" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Work' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a selected option', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditableField
        label="Relationship"
        value="ex_lover"
        source="auto"
        variant="select"
        options={[
          { value: 'ex_lover', label: 'Ex-partner' },
          { value: 'bandmate', label: 'Bandmate' },
        ]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Relationship' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit Relationship' }), { target: { value: 'bandmate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Relationship' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('bandmate'));
  });

  it('surfaces a save error and keeps editing open', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    render(<EditableField label="Work" value="Engineer" source="auto" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Work' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Work' }), { target: { value: 'Designer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Work' }));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Edit Work' })).toBeInTheDocument();
  });
});

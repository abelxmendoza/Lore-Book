import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('renders', () => {
    render(<Input placeholder="Enter" />);
    expect(screen.getByPlaceholderText('Enter')).toBeInTheDocument();
  });

  it('accepts value and onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input value="x" onChange={handleChange} />);
    const input = screen.getByDisplayValue('x');
    await user.type(input, 'y');
    expect(handleChange).toHaveBeenCalled();
  });

  it('applies className', () => {
    render(<Input className="myClass" data-testid="in" />);
    const el = screen.getByTestId('in');
    expect(el.className).toContain('myClass');
  });
});

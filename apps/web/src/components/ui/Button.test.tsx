import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { Button } from './button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole('button', { name: /click me/i });
    button.click();
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is accessible via keyboard', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    
    expect(button).toHaveAttribute('tabindex', '0');
  });

  it('can be disabled', () => {
    render(<Button disabled>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('supports different variants', () => {
    const { rerender } = render(<Button variant="default">Default</Button>);
    const defaultButton = screen.getByRole('button');
    // Check for gradient classes that indicate primary variant
    expect(defaultButton.className).toMatch(/bg-gradient|from-purple|to-fuchsia/);
    
    rerender(<Button variant="outline">Outline</Button>);
    const outlineButton = screen.getByRole('button');
    expect(outlineButton).toHaveClass('border');
  });

  it('supports leftIcon prop', () => {
    const Icon = () => <span data-testid="icon">Icon</span>;
    render(<Button leftIcon={<Icon />}>With Icon</Button>);
    
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /with icon/i })).toBeInTheDocument();
  });
});


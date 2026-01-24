import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders', () => {
    render(<Logo />);
    expect(screen.getByAltText('Lore Book Logo')).toBeInTheDocument();
  });

  it('shows LORE and BOOK text by default', () => {
    render(<Logo />);
    expect(screen.getByText('LORE')).toBeInTheDocument();
    expect(screen.getByText('BOOK')).toBeInTheDocument();
  });

  it('hides text when showText is false', () => {
    render(<Logo showText={false} />);
    expect(screen.queryByText('LORE')).not.toBeInTheDocument();
    expect(screen.queryByText('BOOK')).not.toBeInTheDocument();
    expect(screen.getByAltText('Lore Book Logo')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Logo className="custom" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('custom');
  });

  it('renders with size prop', () => {
    render(<Logo size="sm" />);
    expect(screen.getByAltText('Lore Book Logo')).toBeInTheDocument();
  });
});

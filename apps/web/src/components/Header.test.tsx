import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';

describe('Header', () => {
  it('renders logo and branding', () => {
    render(<Header />);
    expect(screen.getByAltText('Lore Book')).toBeInTheDocument();
    expect(screen.getByText('Lore Book')).toBeInTheDocument();
    expect(screen.getByText('Omega Technologies')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute('href', '/upgrade');
    expect(screen.getByRole('link', { name: /terms/i })).toHaveAttribute('href', '/api/legal/terms');
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/api/legal/privacy');
  });

  it('does not render Upgrade button when onUpgrade is not provided', () => {
    render(<Header />);
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('renders Upgrade button and calls onUpgrade when clicked', () => {
    const onUpgrade = vi.fn();
    render(<Header onUpgrade={onUpgrade} />);
    const button = screen.getByRole('button', { name: /upgrade/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

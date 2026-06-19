import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroLogo, HERO_LOGO_SOURCES } from './HeroLogo';

describe('HeroLogo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with primary logo source', () => {
    render(<HeroLogo />);
    const img = screen.getByRole('img', { name: 'LoreBook' });
    expect(img).toHaveAttribute('src', HERO_LOGO_SOURCES[0]);
  });

  it('falls back through sources on image error', () => {
    render(<HeroLogo />);
    const img = screen.getByRole('img', { name: 'LoreBook' });

    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'LoreBook' })).toHaveAttribute('src', HERO_LOGO_SOURCES[1]);

    fireEvent.error(screen.getByRole('img', { name: 'LoreBook' }));
    expect(screen.getByRole('img', { name: 'LoreBook' })).toHaveAttribute('src', HERO_LOGO_SOURCES[2]);

    fireEvent.error(screen.getByRole('img', { name: 'LoreBook' }));
    expect(screen.getByLabelText('LoreBook')).toBeInTheDocument();
    expect(screen.getByText('LoreBook')).toBeInTheDocument();
  });

  it('marks data-logo-state fallback after all sources fail', () => {
    render(<HeroLogo />);
    const frame = screen.getByTestId('hero-logo');

    for (let i = 0; i < HERO_LOGO_SOURCES.length; i += 1) {
      const image = screen.queryByRole('img', { name: 'LoreBook' });
      if (image) fireEvent.error(image);
    }

    expect(frame).toHaveAttribute('data-logo-state', 'fallback');
  });
});

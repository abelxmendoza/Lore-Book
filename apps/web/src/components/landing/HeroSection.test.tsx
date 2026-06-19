import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroSection } from './HeroSection';

vi.mock('./HeroLogo', () => ({
  HeroLogo: () => <div data-testid="hero-logo-stub" />,
}));

vi.mock('./RotatingHeroHeadline', () => ({
  RotatingHeroHeadline: () => <h1>It Remembers.</h1>,
}));

describe('HeroSection', () => {
  it('renders logo, tagline, support copy, headline, and chat preview', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('hero-logo-stub')).toBeInTheDocument();
    expect(screen.getByText('Life memory · Early access')).toBeInTheDocument();
    expect(screen.getByText(/Every conversation adds to a record of your life/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start a conversation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try demo/i })).toBeInTheDocument();
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /It Remembers/i })).toBeInTheDocument();
    expect(screen.getByText(/LoreBook · Career thread/i)).toBeInTheDocument();
    expect(screen.getByText(/I got the job/i)).toBeInTheDocument();
  });
});

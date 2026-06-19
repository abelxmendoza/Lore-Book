import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RotatingHeroHeadline } from './RotatingHeroHeadline';

const CROSSFADE_MS = 800;

describe('RotatingHeroHeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with It Remembers', () => {
    render(<RotatingHeroHeadline />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/It Remembers/i);
  });

  it('cycles through hero phrases', () => {
    render(<RotatingHeroHeadline />);

    act(() => {
      vi.advanceTimersByTime(5500);
    });
    act(() => {
      vi.advanceTimersByTime(CROSSFADE_MS);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Noted.');

    act(() => {
      vi.advanceTimersByTime(5500);
    });
    act(() => {
      vi.advanceTimersByTime(CROSSFADE_MS);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/learns who you are/i);

    act(() => {
      vi.advanceTimersByTime(5500);
    });
    act(() => {
      vi.advanceTimersByTime(CROSSFADE_MS);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Autobiographer AI/i);
  });
});

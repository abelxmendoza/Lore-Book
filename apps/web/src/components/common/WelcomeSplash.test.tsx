import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { WelcomeSplash } from './WelcomeSplash';
import { resetWelcomeSplash } from '../../lib/welcomeSplash';

// Minimal context stubs — the splash only reads isGuest / useMockData for copy.
vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false }),
}));
vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

describe('WelcomeSplash', () => {
  beforeEach(() => {
    resetWelcomeSplash();
    vi.useRealTimers();
  });

  it('shows once on first mount', () => {
    render(<WelcomeSplash />);
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
    expect(screen.getByText('Welcome to LoreBook')).toBeInTheDocument();
  });

  it('does not show again after it has been seen (simulates a refresh)', () => {
    const first = render(<WelcomeSplash />);
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
    first.unmount();

    // Remount without resetting — mimics a page refresh in the same session.
    render(<WelcomeSplash />);
    expect(screen.queryByTestId('welcome-splash')).not.toBeInTheDocument();
  });

  it('shows again after the gate is reset (a new login)', () => {
    const first = render(<WelcomeSplash />);
    first.unmount();
    expect(render(<WelcomeSplash />).queryByTestId?.('welcome-splash') ?? null).toBeNull();

    resetWelcomeSplash();
    render(<WelcomeSplash />);
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
  });

  it('auto-dismisses after the visible window', () => {
    vi.useFakeTimers();
    render(<WelcomeSplash />);
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();

    // Two steps so the leaving-phase effect (which schedules the fade-out timer)
    // commits before we advance past it. VISIBLE_MS = 3400, FADE_MS = 600.
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByTestId('welcome-splash')).not.toBeInTheDocument();
  });
});

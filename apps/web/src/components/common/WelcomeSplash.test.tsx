import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { WelcomeSplash } from './WelcomeSplash';
import { requestWelcomeSplash, resetWelcomeSplash } from '../../lib/welcomeSplash';

// Minimal context stubs — the splash reads runtime identity for copy.
vi.mock('../../hooks/useRuntimeIdentity', () => ({
  useRuntimeIdentity: () => ({
    is: { demo: false, guest: false, realUser: true, degraded: false },
  }),
}));

function renderSplash(initialPath = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WelcomeSplash />
    </MemoryRouter>,
  );
}

describe('WelcomeSplash', () => {
  beforeEach(() => {
    resetWelcomeSplash();
    vi.useRealTimers();
  });

  it('shows once on first mount on an app route', () => {
    renderSplash('/home');
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
    expect(screen.getByText('Welcome to LoreBook')).toBeInTheDocument();
  });

  it('does not auto-show on public routes like /login', () => {
    renderSplash('/login');
    expect(screen.queryByTestId('welcome-splash')).not.toBeInTheDocument();
  });

  it('shows immediately on /login when guest/demo entry is requested', () => {
    renderSplash('/login');
    expect(screen.queryByTestId('welcome-splash')).not.toBeInTheDocument();

    act(() => {
      requestWelcomeSplash();
    });

    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
  });

  it('does not show again after it has been seen (simulates a refresh)', () => {
    const first = renderSplash('/home');
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
    first.unmount();

    // Remount without resetting — mimics a page refresh in the same session.
    renderSplash('/home');
    expect(screen.queryByTestId('welcome-splash')).not.toBeInTheDocument();
  });

  it('shows again after the gate is reset (a new login)', () => {
    const first = renderSplash('/home');
    first.unmount();
    expect(renderSplash('/home').queryByTestId?.('welcome-splash') ?? null).toBeNull();

    resetWelcomeSplash();
    renderSplash('/home');
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
  });

  it('auto-dismisses after the visible window', () => {
    vi.useFakeTimers();
    renderSplash('/home');
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

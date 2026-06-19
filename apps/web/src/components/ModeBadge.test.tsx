import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeBadge } from './ModeBadge';

const mockUseGuest = vi.fn();
const mockUseAppSelector = vi.fn();

vi.mock('../contexts/GuestContext', () => ({
  useGuest: () => mockUseGuest(),
}));

vi.mock('../store/hooks', () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => mockUseAppSelector(selector),
}));

vi.mock('../store/selectors', () => ({
  selectEffectiveUseMockData: (s: { runtime?: { useMockData?: boolean } }) => s?.runtime?.useMockData ?? false,
}));

describe('ModeBadge', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUseGuest.mockReturnValue({ isGuest: true });
    mockUseAppSelector.mockImplementation((selector) =>
      selector({ runtime: { useMockData: true } }),
    );
  });

  it('renders guest and mock badges when active', () => {
    render(<ModeBadge />);
    expect(screen.getByRole('button', { name: /dismiss guest indicator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss mock data indicator/i })).toBeInTheDocument();
  });

  it('dismisses guest badge on click', () => {
    render(<ModeBadge />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss guest indicator/i }));
    expect(screen.queryByRole('button', { name: /dismiss guest indicator/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss mock data indicator/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('lk_mode_badge_dismissed_guest')).toBe('true');
  });

  it('dismisses mock data badge on click', () => {
    render(<ModeBadge />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss mock data indicator/i }));
    expect(screen.queryByRole('button', { name: /dismiss mock data indicator/i })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('lk_mode_badge_dismissed_mock-data')).toBe('true');
  });
});

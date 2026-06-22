import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from './AuthGate';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  isSupabaseConfigured: () => true,
  getConfigDebug: () => ({ url: 'test', keyPresent: true, issues: [] }),
}));

vi.mock('./InferenceSyncProvider', () => ({
  InferenceSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../hooks/useTermsAcceptance', () => ({
  useTermsAcceptance: () => ({ status: { accepted: true }, loading: false }),
}));

vi.mock('../routes/Demo', () => ({
  clearDemoSession: vi.fn(),
  default: () => null,
}));

vi.mock('../contexts/MockDataContext', () => ({
  useMockData: () => ({
    useMockData: false,
    setUseMockData: vi.fn(),
    runtimeIdentity: 'GUEST_USER',
  }),
}));

vi.mock('../hooks/useRuntimeIdentity', () => ({
  useRuntimeIdentity: () => ({
    needsAuth: false,
    needsTerms: false,
    identity: 'GUEST_USER',
    is: { realUser: false, guest: true, demo: false, degraded: false },
  }),
}));

vi.mock('../contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestState: null,
    startGuestSession: vi.fn(),
    endGuestSession: vi.fn(),
    incrementChatMessage: vi.fn(() => false),
    canSendChatMessage: vi.fn(() => true),
  }),
}));

describe('AuthGate — app shell access', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it('redirects anonymous dashboard visits to the landing page', async () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/" element={<div data-testid="landing">Landing</div>} />
          <Route
            path="/home"
            element={
              <AuthGate>
                <div data-testid="app-content">Dashboard</div>
              </AuthGate>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('lk_auth_return')).toBe('/home');
  });
});

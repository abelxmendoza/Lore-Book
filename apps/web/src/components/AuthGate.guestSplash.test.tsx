import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthGate } from './AuthGate';
import { WelcomeSplash } from './common/WelcomeSplash';
import { resetWelcomeSplash } from '../lib/welcomeSplash';

// Guest/demo runtime: needs neither auth nor terms — enters only after explicit guest/demo choice.
vi.mock('../hooks/useRuntimeIdentity', () => ({
  useRuntimeIdentity: () => ({
    needsAuth: false,
    needsTerms: false,
    identity: 'GUEST_USER',
    is: { realUser: false, guest: true, demo: false, degraded: false },
  }),
}));

vi.mock('../lib/supabase', () => ({
  // AuthGate now always resolves the session (even for guest runtimes) so a
  // refreshed real user — who looks like GUEST_USER until auth bootstraps —
  // isn't bounced to the landing page. The mock must therefore resolve.
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) } },
  isSupabaseConfigured: () => true,
  getConfigDebug: () => ({ url: 'test', keyPresent: true }),
}));

vi.mock('./InferenceSyncProvider', () => ({
  InferenceSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: true, startGuestSession: vi.fn(), endGuestSession: vi.fn() }),
}));

vi.mock('../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false, setUseMockData: vi.fn() }),
}));

vi.mock('../hooks/useTermsAcceptance', () => ({
  useTermsAcceptance: () => ({ status: { accepted: true }, loading: false }),
}));

vi.mock('../routes/Demo', () => ({ clearDemoSession: vi.fn(), isDemoSession: () => false, default: () => null }));

describe('AuthGate — welcome splash on guest/demo entry', () => {
  beforeEach(() => {
    resetWelcomeSplash();
  });

  it('shows the global welcome splash when guest enters the app', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <WelcomeSplash />
        <AuthGate>
          <div data-testid="app-content">App Content</div>
        </AuthGate>
      </MemoryRouter>
    );

    // Both the splash and the app content render (splash overlays the app).
    expect(screen.getByTestId('welcome-splash')).toBeInTheDocument();
    expect(screen.getByTestId('app-content')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from './RouteGuard';
import type { ServerAccountAuthority } from '../lib/accountAuthority';

const mockUseAccountAuthority = vi.fn();

vi.mock('../hooks/useAccountAuthority', () => ({
  useAccountAuthority: () => mockUseAccountAuthority(),
}));

vi.mock('./AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../config/env', () => ({
  config: { env: { isProduction: true } },
}));

vi.mock('../routes/NotFound', () => ({
  default: () => <div data-testid="not-found">Not Found</div>,
}));

const adminAuthority: ServerAccountAuthority = {
  role: 'admin',
  roleLabel: 'Admin',
  isFounderAccount: false,
  isPrivileged: true,
  privilegeSource: 'administrative_privilege',
  effectivePlanType: 'premium',
  canBeBilled: false,
  canCancelSubscription: false,
  canLoseAccess: false,
  canAccessAdmin: true,
  canAccessDevConsole: true,
};

const userAuthority: ServerAccountAuthority = {
  role: 'user',
  roleLabel: 'User',
  isFounderAccount: false,
  isPrivileged: false,
  privilegeSource: 'free_tier',
  effectivePlanType: 'free',
  canBeBilled: true,
  canCancelSubscription: true,
  canLoseAccess: true,
  canAccessAdmin: false,
  canAccessDevConsole: false,
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children for authenticated routes', () => {
    mockUseAccountAuthority.mockReturnValue({ authority: userAuthority, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute access="authenticated">
          <div data-testid="child">App</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows 404 for non-admin on admin routes in production', async () => {
    mockUseAccountAuthority.mockReturnValue({ authority: userAuthority, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute access="admin">
          <div data-testid="child">Admin</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('allows admin users on admin routes', async () => {
    mockUseAccountAuthority.mockReturnValue({ authority: adminAuthority, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute access="admin">
          <div data-testid="child">Admin</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  it('returns 404 for dev-console in production builds', () => {
    mockUseAccountAuthority.mockReturnValue({ authority: adminAuthority, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute access="dev-console">
          <div data-testid="child">Dev</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });
});

import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthGate } from './AuthGate';
import { BookGhostLoader } from './common/BookGhostLoader';
import { useAccountAuthority } from '../hooks/useAccountAuthority';
import { canAccessAdmin, canAccessDevConsole } from '../middleware/roleGuard';
import type { RouteAccessLevel } from '../middleware/routeAccess';
import { config } from '../config/env';
import NotFound from '../routes/NotFound';

type ProtectedAccess = Exclude<RouteAccessLevel, 'public'>;

function hasRoleAccess(access: ProtectedAccess, authority: ReturnType<typeof useAccountAuthority>['authority']): boolean {
  switch (access) {
    case 'admin':
      return canAccessAdmin(authority);
    case 'dev-console':
      return canAccessDevConsole(authority);
    default:
      return true;
  }
}

function RoleGate({ access, children }: { access: ProtectedAccess; children: ReactNode }) {
  const { authority, loading } = useAccountAuthority();

  if (loading) {
    return (
      <BookGhostLoader
        fullScreen
        caption="Verifying access…"
        subtext="Checking your account permissions"
      />
    );
  }

  if (!hasRoleAccess(access, authority)) {
    // Hide privileged routes in production — generic 404, no route discovery hints.
    if (config.env.isProduction || access === 'dev-console') {
      return <NotFound />;
    }
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

/**
 * Router-level guard: authentication + optional role enforcement.
 * Wrap all non-public routes with this component.
 */
export function ProtectedRoute({
  access = 'authenticated',
  children,
}: {
  access?: ProtectedAccess;
  children: ReactNode;
}) {
  if (access === 'dev-console' && config.env.isProduction) {
    return <NotFound />;
  }

  return (
    <AuthGate>
      {access === 'authenticated' ? children : <RoleGate access={access}>{children}</RoleGate>}
    </AuthGate>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';

import { getConfigDebug, isSupabaseConfigured, supabase } from '../lib/supabase';
import { LANDING_PATH, saveAuthReturnPath } from '../lib/authReturnPath';
import { clearDemoSession, isDemoSession } from '../routes/Demo';
import { Logo } from './Logo';
import { TermsOfServiceAgreement } from './security/TermsOfServiceAgreement';
import { useTermsAcceptance } from '../hooks/useTermsAcceptance';
import { useGuest } from '../contexts/GuestContext';
import { useRuntimeIdentity } from '../hooks/useRuntimeIdentity';
import { InferenceSyncProvider } from './InferenceSyncProvider';
import { BookGhostLoader } from './common/BookGhostLoader';
import { resetWelcomeSplash } from '../lib/welcomeSplash';

export const AuthGate = ({ children }: { children: ReactNode }) => {
  // Auth bypass: only active when VITE_DEV_DISABLE_AUTH=true AND running in dev mode.
  // Never bypasses in production builds. Set in apps/web/.env.local (never commit).
  const DEV_DISABLE_AUTH =
    import.meta.env.DEV === true &&
    import.meta.env.VITE_DEV_DISABLE_AUTH === 'true';
  const DEV_DISABLE_TERMS = DEV_DISABLE_AUTH;
  const location = useLocation();

  if (DEV_DISABLE_AUTH) {
    console.warn('[AuthGate] DEV_AUTH_BYPASS active — using unauthenticated dev session. Never enable in production.');
  }

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { status: termsStatus, loading: termsLoading } = useTermsAcceptance();
  const { isGuest, endGuestSession } = useGuest();
  const { needsAuth, needsTerms } = useRuntimeIdentity();
  // A demo runtime grants the same no-auth, mock-data-only access as a guest.
  const inDemo = isDemoSession();

  const isConfigured = isSupabaseConfigured();
  const debug = getConfigDebug();

  // The dev auth bypass is the only case that can skip the session check. We
  // must NOT skip it for "non-auth" runtimes here: on a hard refresh the runtime
  // identity defaults to GUEST_USER until the global auth bootstrap resolves, so
  // skipping the check would flip loading off with no session and bounce an
  // authenticated user to the landing page. Always resolve the session below.
  useEffect(() => {
    if (DEV_DISABLE_AUTH) {
      setLoading(false);
    }
  }, [DEV_DISABLE_AUTH]);

  // Safety timeout for loading state (must be before early returns)
  useEffect(() => {
    if (loading) {
      const safetyTimeout = setTimeout(() => {
        console.warn('[AuthGate] Loading timeout (5s) - proceeding anyway to prevent black screen');
        setLoading(false);
      }, 5000);
      return () => clearTimeout(safetyTimeout);
    }
  }, [loading]);

  // Initialize Supabase session (must be before early returns)
  useEffect(() => {
    // Always resolve the session except under the dev bypass. Gating this on
    // runtime identity races the cold-boot GUEST_USER default and redirects
    // refreshed, authenticated users to the landing page.
    if (DEV_DISABLE_AUTH) {
      return;
    }

    // CRITICAL: Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('[AuthGate] Session check timeout - proceeding without auth');
      setLoading(false);
    }, 5000); // 5 second timeout

    if (!isConfigured) {
      console.warn('[AuthGate] Supabase not configured:', debug);
      clearTimeout(timeoutId);
      setLoading(false);
      return;
    }

    console.log('[AuthGate] Initializing Supabase session...');
    supabase.auth.getSession()
      .then(({ data, error }) => {
        clearTimeout(timeoutId);
        if (error) {
          console.error('[AuthGate] Session error:', error);
          setInitError(`Session error: ${error.message}`);
        } else {
          console.log('[AuthGate] Session loaded:', data.session ? 'Authenticated' : 'Not authenticated');
          setSession(data.session);

          // Exiting demo/guest runtime when a real session is established
          if (data.session?.user) {
            clearDemoSession();
            endGuestSession();
          }

          // Identify user for analytics and error tracking on initial load
          if (data.session?.user) {
            import('../lib/monitoring').then(({ analytics, errorTracking }) => {
              analytics.identify(data.session.user.id, {
                email: data.session.user.email,
                name: data.session.user.user_metadata?.full_name || data.session.user.user_metadata?.name,
              });
              errorTracking.setUser({
                id: data.session.user.id,
                email: data.session.user.email || undefined,
                username: data.session.user.user_metadata?.name || undefined,
              });
            });
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('[AuthGate] Session exception:', err);
        setInitError(`Failed to initialize: ${err.message}`);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[AuthGate] Auth state changed:', event, newSession ? 'Authenticated' : 'Not authenticated');
      setSession(newSession);

      // Exiting demo/guest runtime when a real session is established
      if (newSession?.user) {
        clearDemoSession();
        endGuestSession();
      }

      // Log login events for account activity history
      if (event === 'SIGNED_IN' && newSession?.user) {
        import('../api/user').then(({ logActivity }) => {
          logActivity('Login').catch(() => {});
        });
      }

      // Identify user for analytics and error tracking
      if (newSession?.user) {
        import('../lib/monitoring').then(({ analytics, errorTracking }) => {
          analytics.identify(newSession.user.id, {
            email: newSession.user.email,
            name: newSession.user.user_metadata?.full_name || newSession.user.user_metadata?.name,
          });
          errorTracking.setUser({
            id: newSession.user.id,
            email: newSession.user.email || undefined,
            username: newSession.user.user_metadata?.name || undefined,
          });
        });
      } else {
        // Clear user identification on logout
        import('../lib/monitoring').then(({ analytics, errorTracking }) => {
          analytics.reset();
          errorTracking.clearUser();
        });
      }

      // Reset the welcome-splash gate on a real sign-out so the next login shows
      // it again. SIGNED_OUT never fires on refresh, so this won't cause reshows.
      if (event === 'SIGNED_OUT') {
        resetWelcomeSplash();
      }
    });

    return () => {
      clearTimeout(timeoutId);
      listener?.subscription.unsubscribe();
    };
  }, [isConfigured, debug, endGuestSession]);

  // DEV-only escape hatch — never reaches production.
  if (DEV_DISABLE_AUTH) return <>{children}</>;

  // Guest/demo/degraded runtimes skip ToS, but only after explicit entry (session,
  // Continue as Guest, or Demo Mode) — never for a cold visit to /home, /chat, etc.
  if (!needsAuth && !needsTerms) {
    if (session || isGuest || inDemo) {
      return <>{children}</>;
    }
  }

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-black">
        <div className="mx-auto max-w-md rounded-2xl border border-red-500/50 bg-black/40 p-10 text-center">
          <Logo size="xl" showText={true} className="mb-8 justify-center" />
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-left">
            <p className="text-sm font-semibold text-red-400">Configuration Required</p>
            <p className="mt-2 text-xs text-white/70">
              Please configure your Supabase credentials in the <code className="rounded bg-white/10 px-1 py-0.5">.env</code> file:
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-white/60">
              <li><code>VITE_SUPABASE_URL</code></li>
              <li><code>VITE_SUPABASE_ANON_KEY</code></li>
            </ul>
            {debug.issues.length > 0 && (
              <div className="mt-4 rounded border border-yellow-500/30 bg-yellow-950/20 p-3">
                <p className="text-xs font-semibold text-yellow-400 mb-2">Debug Info:</p>
                <ul className="list-inside list-disc space-y-1 text-xs text-yellow-300/80">
                  {debug.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-yellow-300/60">
                  URL: {debug.url.substring(0, 50)}...
                </p>
                <p className="text-xs text-yellow-300/60">
                  Key present: {debug.keyPresent ? 'Yes' : 'No'}
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-white/50">
              After updating, restart the dev server with: <code className="rounded bg-white/10 px-1 py-0.5">pnpm run dev:web</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !isGuest && !inDemo) {
    return (
      <BookGhostLoader
        fullScreen
        caption="Syncing your memory…"
        subtext={initError ?? 'This should only take a moment…'}
        data-testid="auth-loading"
      />
    );
  }

  if (!session && !isGuest && !inDemo) {
    saveAuthReturnPath(location.pathname, location.search);
    return <Navigate to={LANDING_PATH} replace />;
  }

  // Show terms agreement if user hasn't accepted
  if (session && !termsLoading && !DEV_DISABLE_TERMS) {
    if (!termsStatus || !termsStatus.accepted) {
      return <TermsOfServiceAgreement onAccept={() => window.location.reload()} />;
    }
  }

  return (
    <InferenceSyncProvider>
      {children}
    </InferenceSyncProvider>
  );
};

import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { User } from 'lucide-react';

import { getConfigDebug, isSupabaseConfigured, supabase } from '../lib/supabase';
import { Logo } from './Logo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { TermsOfServiceAgreement } from './security/TermsOfServiceAgreement';
import { useTermsAcceptance } from '../hooks/useTermsAcceptance';
import { useGuest } from '../contexts/GuestContext';

const AuthScreen = ({ onEmailLogin, onGuestLogin }: { onEmailLogin: (email: string) => Promise<void>; onGuestLogin: () => void }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      await onEmailLogin(email);
      setStatus('Check your email for the magic link.');
    } catch (err: any) {
      console.error('[Auth] Login error:', err);
      setError(err?.message || 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) {
        console.error('[Auth] Google OAuth error:', error);
        // Check for specific error codes
        if (error.message?.includes('provider is not enabled') || error.message?.includes('Unsupported provider')) {
          setError('Google sign-in is not enabled in your Supabase project. Please enable it in Settings > Authentication > Providers.');
        } else {
          setError(error.message || 'Failed to sign in with Google.');
        }
      }
    } catch (err: any) {
      console.error('[Auth] Google OAuth exception:', err);
      if (err?.message?.includes('provider is not enabled') || err?.message?.includes('Unsupported provider')) {
        setError('Google sign-in is not enabled in your Supabase project. Please enable it in Settings > Authentication > Providers.');
      } else {
        setError(err?.message || 'Failed to sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-20 flex max-w-md flex-col items-center rounded-2xl border border-border/60 bg-black/30 p-10 text-center shadow-panel">
      <Logo size="xl" showText={true} className="mb-8" />
      <p className="mt-2 text-white/70">Your intelligent memory companion. Capture, organize, and understand your life story.</p>
      <Input
        type="email"
        placeholder="you@orbital.city"
        className="mt-8"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button className="mt-4 w-full" disabled={!email || loading} onClick={handleLogin}>
        {loading ? 'Sending link…' : 'Send magic link'}
      </Button>
      <Button variant="ghost" className="mt-3 w-full" onClick={handleGoogle} disabled={loading}>
        {loading ? 'Connecting...' : 'Continue with Google'}
      </Button>
      
      <div className="my-6 flex items-center w-full">
        <div className="flex-1 border-t border-white/10"></div>
        <span className="px-3 text-xs text-white/40">or</span>
        <div className="flex-1 border-t border-white/10"></div>
      </div>

      {/* Guest Login - Prominent */}
      <div className="w-full space-y-2">
        <Button 
          variant="outline" 
          className="w-full border-primary/50 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/70 transition-all" 
          onClick={onGuestLogin}
          disabled={loading}
          size="lg"
        >
          <User className="mr-2 h-5 w-5" />
          Continue as Guest
        </Button>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-left">
          <p className="text-xs font-medium text-primary mb-1">✨ Try without signing up</p>
          <p className="text-xs text-white/60 leading-relaxed">
            Explore all features with limited chat access. No account required.
          </p>
        </div>
      </div>
      {status && <p className="mt-4 text-xs text-green-400">{status}</p>}
      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
    </div>
  );
};

export const AuthGate = ({ children }: { children: ReactNode }) => {
  // TEMPORARY: Disable auth for development
  const DEV_DISABLE_AUTH = true;
  // TEMPORARY: Disable terms agreement in dev mode
  const DEV_DISABLE_TERMS = true;
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { status: termsStatus, loading: termsLoading, error: termsError } = useTermsAcceptance();
  const { isGuest, startGuestSession } = useGuest();

  const isConfigured = isSupabaseConfigured();
  const debug = getConfigDebug();
  
  // CRITICAL: Set loading to false immediately when auth is disabled (must be at top level)
  useEffect(() => {
    if (DEV_DISABLE_AUTH || isGuest) {
      setLoading(false);
    }
  }, [isGuest]);
  
  // Check terms acceptance (works in both dev and production)
  useEffect(() => {
    if (termsStatus && !termsStatus.accepted && !termsLoading) {
      setTermsAccepted(false);
    } else if (termsStatus?.accepted) {
      setTermsAccepted(true);
    }
  }, [termsStatus, termsLoading]);

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

  // Check terms after authentication (must be before early returns)
  useEffect(() => {
    if (session && termsStatus && !termsStatus.accepted && !termsLoading) {
      setTermsAccepted(false);
    } else if (termsStatus?.accepted) {
      setTermsAccepted(true);
    }
  }, [session, termsStatus, termsLoading]);

  // Initialize Supabase session (must be before early returns)
  useEffect(() => {
    // Skip if auth is disabled or already guest
    if (DEV_DISABLE_AUTH || isGuest) {
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
    });

    return () => {
      clearTimeout(timeoutId);
      listener?.subscription.unsubscribe();
    };
  }, [isConfigured, isGuest, debug]);
  
  // Allow guest access or authenticated users
  if (isGuest || DEV_DISABLE_AUTH) {
    // Skip terms agreement in dev mode if disabled
    if (DEV_DISABLE_TERMS) {
      return <>{children}</>;
    }
    
    // Show terms agreement if user hasn't accepted
    // Show it if:
    // 1. We have a status and it's not accepted, OR
    // 2. We're done loading and don't have a status (API failed/timed out - default to not accepted)
    if (!termsLoading) {
      if (!termsStatus || !termsStatus.accepted) {
        return <TermsOfServiceAgreement onAccept={() => {
          setTermsAccepted(true);
          // Refresh terms status after acceptance
          window.location.reload();
        }} />;
      }
    }

    // If still loading, show a loading state or children (don't block the app)
    // The timeout in useTermsAcceptance will handle long waits
    return <>{children}</>;
  }

  const handleEmailLogin = async (email: string) => {
    console.log('[AuthGate] Attempting email login for:', email);
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { emailRedirectTo: window.location.origin } 
    });
    if (error) {
      console.error('[AuthGate] Email login error:', error);
      throw error;
    }
    console.log('[AuthGate] Magic link sent successfully');
  };

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

  /**
   * CRITICAL: Safety timeout to prevent infinite loading screen
   * 
   * Pattern: Never allow a gate to hold the UI hostage indefinitely.
   * 
   * This timeout ensures that even if Supabase initialization:
   * - Hangs (network stall)
   * - Fails silently (bad DNS, misconfigured env)
   * - Takes too long (cold-start edge cases)
   * 
   * The UI will still render after 5 seconds, preventing black screens.
   * 
   * This is the production-safe pattern for any blocking initialization:
   * 1. Set a timeout
   * 2. Clear it when done
   * 3. Force release if timeout fires
   */
  
  /**
   * CRITICAL: Always render something visible - never return null
   * 
   * This prevents black screens even if auth logic fails silently.
   * A visible loading state is always better than silent emptiness.
   */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-black">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
          <p className="animate-pulse font-techno tracking-[0.5em] text-primary">Syncing memory…</p>
          {initError && (
            <p className="mt-4 text-xs text-red-400 max-w-md">{initError}</p>
          )}
          <p className="mt-2 text-xs text-white/40">This should only take a moment...</p>
        </div>
      </div>
    );
  }

  const handleGuestLogin = () => {
    startGuestSession();
  };

  if (!session && !isGuest) {
    return <AuthScreen onEmailLogin={handleEmailLogin} onGuestLogin={handleGuestLogin} />;
  }

  // Show terms agreement if user hasn't accepted
  // Show it if:
  // 1. User is authenticated, AND
  // 2. We're done loading, AND
  // 3. We don't have a status OR the status shows not accepted
  // Skip in dev mode if disabled
  if (session && !termsLoading && !DEV_DISABLE_TERMS) {
    if (!termsStatus || !termsStatus.accepted) {
      return <TermsOfServiceAgreement onAccept={() => {
        setTermsAccepted(true);
        // Refresh terms status after acceptance
        window.location.reload();
      }} />;
    }
  }

  return <>{children}</>;
};

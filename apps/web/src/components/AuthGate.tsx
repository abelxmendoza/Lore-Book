import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getConfigDebug, isSupabaseConfigured, supabase } from '../lib/supabase';
import { Logo } from './Logo';
import { Button } from './ui/button';
import { Input } from './ui/input';

const AuthScreen = ({ onEmailLogin }: { onEmailLogin: (email: string) => Promise<void> }) => {
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
      <p className="mt-2 text-white/70">AI-powered journal with a cyberpunk heart.</p>
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
      {status && <p className="mt-4 text-xs text-green-400">{status}</p>}
      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
    </div>
  );
};

export const AuthGate = ({ children }: { children: ReactNode }) => {
  // TEMPORARY: Disable auth for development
  const DEV_DISABLE_AUTH = true;
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();
  const debug = getConfigDebug();
  
  // Bypass auth check in dev mode
  if (DEV_DISABLE_AUTH) {
    return <>{children}</>;
  }

  useEffect(() => {
    if (!isConfigured) {
      console.warn('[AuthGate] Supabase not configured:', debug);
      setLoading(false);
      return;
    }

    console.log('[AuthGate] Initializing Supabase session...');
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('[AuthGate] Session error:', error);
          setInitError(`Session error: ${error.message}`);
        } else {
          console.log('[AuthGate] Session loaded:', data.session ? 'Authenticated' : 'Not authenticated');
          setSession(data.session);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AuthGate] Session exception:', err);
        setInitError(`Failed to initialize: ${err.message}`);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[AuthGate] Auth state changed:', event, newSession ? 'Authenticated' : 'Not authenticated');
      setSession(newSession);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [isConfigured, debug]);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-black">
        <div className="text-center">
          <p className="animate-pulse font-techno tracking-[0.5em] text-primary">Syncing memory…</p>
          {initError && (
            <p className="mt-4 text-xs text-red-400 max-w-md">{initError}</p>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onEmailLogin={handleEmailLogin} />;
  }

  return <>{children}</>;
};

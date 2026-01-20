import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Sparkles, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useGuest } from '../contexts/GuestContext';

export default function Login() {
  const navigate = useNavigate();
  const { startGuestSession } = useGuest();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/',
      },
    });
    if (error) throw error;
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      await handleEmailLogin(email);
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
        if (error.message?.includes('provider is not enabled') || error.message?.includes('Unsupported provider')) {
          setError('Google sign-in is not enabled. Please use email login.');
        } else {
          setError(error.message || 'Failed to sign in with Google.');
        }
      }
    } catch (err: any) {
      console.error('[Auth] Google OAuth exception:', err);
      setError(err?.message || 'Failed to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm shadow-2xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-white" />
              </div>
            </div>
            <Logo size="xl" showText={true} />
            <p className="text-white/70 text-sm">Your intelligent memory companion. Capture, organize, and understand your life story.</p>
          </div>

          {/* Login Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white/40" />
                <Input
                  type="email"
                  placeholder="you@orbital.city"
                  className="pl-10 bg-black/40 border-border/60 text-white placeholder:text-white/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
                />
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              disabled={!email || loading}
              onClick={handleLogin}
            >
              {loading ? 'Sending link…' : 'Send magic link'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-black/40 px-2 text-white/40">Or continue with</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full border-border/60 bg-white/5 hover:bg-white/10 text-white"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-black/40 px-2 text-white/40">or</span>
              </div>
            </div>

            {/* Guest Login */}
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full border-primary/50 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/70 transition-all"
                onClick={() => {
                  startGuestSession();
                  navigate('/');
                }}
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

            {status && (
              <div className="rounded-lg bg-green-500/20 border border-green-500/50 p-4 text-green-400 text-sm">
                {status}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-center text-white/40">
              By continuing, you agree to our{' '}
              <button onClick={() => navigate('/terms')} className="text-primary hover:underline">
                Terms of Service
              </button>
              {' '}and{' '}
              <button onClick={() => navigate('/privacy-policy')} className="text-primary hover:underline">
                Privacy Policy
              </button>
            </p>
          </div>
        </div>

        {/* Back to app link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-white/60 hover:text-white text-sm transition"
          >
            ← Back to app
          </button>
        </div>
      </div>
    </div>
  );
}


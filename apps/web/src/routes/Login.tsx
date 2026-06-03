import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { useGuest } from '../contexts/GuestContext';
import { useMockData } from '../contexts/MockDataContext';

// ── Left-side feature statements ─────────────────────────────────────────────

const FEATURES = [
  { accent: 'Remembers', rest: 'across sessions, not just within them.' },
  { accent: 'Tracks', rest: 'the people, patterns, and moments that shape you.' },
  { accent: 'Gets smarter', rest: 'the longer you use it.' },
];

// ── Preview conversation (static, illustrates the product) ───────────────────

const PREVIEW = [
  { role: 'user',      text: 'Jamie texted me.' },
  {
    role: 'assistant',
    text: 'Jamie — last time you brought them up you were figuring out whether to reach out first. Looks like they beat you to it. What did they say?',
  },
];

// ── Google G mark ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const { startGuestSession } = useGuest();
  const { setUseMockData } = useMockData();

  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleMagicLink = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + '/' },
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        setError(
          error.message?.includes('provider is not enabled') || error.message?.includes('Unsupported provider')
            ? 'Google sign-in is not configured. Use your email instead.'
            : error.message || 'Google sign-in failed.'
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = () => {
    setUseMockData(true);
    startGuestSession();
    navigate('/');
  };

  const enterGuest = () => {
    setUseMockData(false);
    startGuestSession();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#080510] text-white flex flex-col lg:flex-row overflow-hidden">

      {/* ── Atmospheric glows ───────────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[700px] h-[500px] bg-primary/10 rounded-full blur-[140px] -translate-x-1/3 -translate-y-1/4" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-violet-700/8 rounded-full blur-[120px] translate-x-1/4 translate-y-1/4" />
      </div>

      {/* ── LEFT — product pitch ─────────────────────────────────────────────── */}
      <div className="relative z-10 hidden lg:flex flex-col justify-between w-[52%] flex-shrink-0 px-14 py-12 border-r border-white/6">

        {/* Logo */}
        <Logo size="sm" showText />

        {/* Hero text */}
        <div>
          <h1 className="text-[2.6rem] leading-[1.12] font-bold font-serif text-white mb-6">
            The AI that<br />
            <span className="text-primary">learns who you are.</span>
          </h1>
          <p className="text-white/40 text-base leading-relaxed mb-10 max-w-sm">
            Not just facts. Patterns. The people who matter.
            The decisions you keep second-guessing. The version of yourself
            you're becoming.
          </p>

          {/* Feature statements */}
          <ul className="space-y-3 mb-12">
            {FEATURES.map(({ accent, rest }) => (
              <li key={accent} className="flex items-start gap-3 text-sm text-white/55">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-primary/70 flex-shrink-0 translate-y-[6px]" />
                <span>
                  <span className="text-white/90 font-medium">{accent}</span>{' '}
                  {rest}
                </span>
              </li>
            ))}
          </ul>

          {/* Mini conversation preview */}
          <div className="rounded-2xl border border-white/8 bg-black/30 p-5 max-w-sm">
            <div className="space-y-3">
              {PREVIEW.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
                      msg.role === 'user'
                        ? 'bg-primary/20 text-white/85 rounded-br-sm'
                        : 'bg-white/6 text-white/70 rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-white/20 text-right">
              LoreBook remembered Jamie from a previous conversation.
            </p>
          </div>
        </div>

        {/* Bottom social proof */}
        <p className="text-xs text-white/20">
          Free while in early access · No credit card required
        </p>
      </div>

      {/* ── RIGHT — auth form ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-10 lg:py-0">

        {/* Mobile-only header */}
        <div className="lg:hidden mb-8 text-center">
          <Logo size="md" showText />
          <p className="text-white/40 text-sm mt-2">The AI that learns who you are.</p>
        </div>

        <div className="w-full max-w-sm">

          {/* Form heading */}
          <div className="mb-7">
            <h2 className="text-xl font-bold text-white mb-1">Sign in to LoreBook</h2>
            <p className="text-sm text-white/35">Your record is waiting.</p>
          </div>

          {/* ── Sent state ─────────────────────────────────────────────────── */}
          {sent ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-6 text-center space-y-3">
              <CheckCircle className="h-9 w-9 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-white">Check your inbox</p>
              <p className="text-xs text-white/45 leading-relaxed">
                We sent a magic link to <span className="text-white/70">{email}</span>.
                Click it to sign in — no password needed.
              </p>
              <p className="text-[11px] text-white/25">
                Didn't arrive? Check spam, or{' '}
                <button
                  type="button"
                  onClick={() => { setSent(false); setError(null); }}
                  className="text-primary/70 hover:text-primary underline transition"
                >
                  try again
                </button>.
              </p>
            </div>
          ) : (

            /* ── Auth form ──────────────────────────────────────────────────── */
            <div className="space-y-3">

              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 pointer-events-none" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  autoComplete="email"
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && email && handleMagicLink()}
                  className="w-full bg-white/[0.05] border border-white/12 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>

              {/* Magic link CTA */}
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={!email.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.25)]"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><span>Continue with email</span><ArrowRight className="h-4 w-4" /></>
                }
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[11px] text-white/25 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 bg-white/[0.06] hover:bg-white/10 border border-white/12 hover:border-white/20 text-white/80 hover:text-white text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-xs text-red-400 leading-relaxed">
                  {error}
                </div>
              )}

              {/* Try without signing in */}
              <div className="pt-1 flex items-center justify-center gap-4 text-xs text-white/25">
                <button
                  type="button"
                  onClick={enterGuest}
                  className="hover:text-white/60 transition"
                >
                  Continue as guest
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={enterDemo}
                  className="hover:text-white/60 transition"
                >
                  View demo
                </button>
              </div>
            </div>
          )}

          {/* Terms */}
          <p className="mt-8 text-[11px] text-center text-white/20 leading-relaxed">
            By continuing, you agree to our{' '}
            <button
              type="button"
              onClick={() => navigate('/terms')}
              className="text-white/35 hover:text-white/60 underline transition"
            >
              Terms
            </button>
            {' '}and{' '}
            <button
              type="button"
              onClick={() => navigate('/privacy-policy')}
              className="text-white/35 hover:text-white/60 underline transition"
            >
              Privacy Policy
            </button>.
          </p>

          {/* Back */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="text-xs text-white/20 hover:text-white/50 transition"
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

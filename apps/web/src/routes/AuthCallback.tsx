import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Supabase OAuth returns tokens in the URL hash
        // The Supabase client automatically processes the hash when we call getSession()
        // But we should also check for errors in the hash first
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const errorParam = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        if (errorParam) {
          console.error('[AuthCallback] OAuth error:', errorParam, errorDescription);
          setError(errorDescription || errorParam || 'Authentication failed');
          setLoading(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        // Wait a moment for Supabase to process the hash
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the session (Supabase should have processed the hash by now)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          setError(sessionError.message || 'Failed to create session');
          setLoading(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        if (session) {
          console.log('[AuthCallback] Authentication successful');
          // Clear the hash from the URL
          window.history.replaceState(null, '', window.location.pathname);
          // Redirect to home page
          navigate('/');
        } else {
          // If no session, check if there's a hash (might still be processing)
          if (window.location.hash) {
            // Wait a bit more and try again
            setTimeout(async () => {
              const { data: { session: retrySession } } = await supabase.auth.getSession();
              if (retrySession) {
                window.history.replaceState(null, '', window.location.pathname);
                navigate('/');
              } else {
                setError('No session created. Please try again.');
                setLoading(false);
                setTimeout(() => navigate('/login'), 3000);
              }
            }, 500);
          } else {
            setError('No session created. Please try again.');
            setLoading(false);
            setTimeout(() => navigate('/login'), 3000);
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Exception:', err);
        setError(err?.message || 'An unexpected error occurred');
        setLoading(false);
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center">
        <div className="text-center">
          <Logo size="xl" showText={true} className="mb-8" />
          <p className="text-white/70 text-lg">Completing authentication...</p>
          <div className="mt-4 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <Logo size="xl" showText={true} className="mb-8" />
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6">
            <p className="text-red-400 font-semibold mb-2">Authentication Error</p>
            <p className="text-white/70">{error}</p>
            <p className="text-white/50 text-sm mt-4">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

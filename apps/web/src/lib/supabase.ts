import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

type SupabaseConfig = {
  url: string;
  key: string;
};

const getConfig = (): { config: SupabaseConfig | null; debug: { url: string; keyPresent: boolean; issues: string[] } } => {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  
  const issues: string[] = [];
  
  // Debug logging (only in development)
  if (import.meta.env.DEV) {
    console.log('[Supabase Config Debug]', {
      url: url ? `${url.substring(0, 30)}...` : 'MISSING',
      keyPresent: !!key,
      keyLength: key?.length || 0,
      allEnvVars: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
  }

  if (!url) {
    issues.push('VITE_SUPABASE_URL is missing');
  } else if (url.includes('your-project')) {
    issues.push('VITE_SUPABASE_URL contains placeholder value');
  } else if (!url.startsWith('https://') && !url.startsWith('http://')) {
    issues.push('VITE_SUPABASE_URL is not a valid URL');
  }

  if (!key) {
    issues.push('VITE_SUPABASE_ANON_KEY is missing');
  } else if (key.includes('public-anon-key')) {
    issues.push('VITE_SUPABASE_ANON_KEY contains placeholder value');
  } else if (key.length < 50) {
    issues.push('VITE_SUPABASE_ANON_KEY appears to be too short (expected JWT token)');
  }

  if (issues.length > 0 && import.meta.env.DEV) {
    console.error('[Supabase Config] Configuration issues:', issues);
  }

  const config: SupabaseConfig | null = issues.length === 0 && url && key 
    ? { url, key }
    : null;

  return {
    config,
    debug: {
      url: url || 'MISSING',
      keyPresent: !!key,
      issues
    }
  };
};

const { config, debug } = getConfig();

// Create a dummy client if config is missing to prevent crashes
export const supabase = config 
  ? createClient(config.url, config.key)
  : createClient('https://placeholder.supabase.co', 'placeholder-key');

export const isSupabaseConfigured = () => config !== null;

export const getConfigDebug = () => debug;

// Auth hook
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

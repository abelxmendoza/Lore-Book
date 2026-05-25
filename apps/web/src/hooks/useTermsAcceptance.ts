import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { config } from '../config/env';
import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import { supabase } from '../lib/supabase';

type TermsStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  version: string;
};

const DEFAULT_TERMS_STATUS: TermsStatus = { accepted: false, acceptedAt: null, version: '1.0' };
const TERMS_VERSION = '1.0';

// Retry up to 3 times with 1s delay when session isn't established yet (403)
async function checkTermsViaSupabase(retries = 3): Promise<TermsStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_TERMS_STATUS;

  const { data, error } = await supabase
    .from('terms_acceptance')
    .select('accepted_at, version')
    .eq('user_id', user.id)
    .eq('version', TERMS_VERSION)
    .maybeSingle();

  if (error) {
    // 403 = RLS blocked, session token not yet propagated — wait and retry
    const isAuthNotReady = (error as any).code === 403 || error.message?.includes('permission denied');
    if (isAuthNotReady && retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return checkTermsViaSupabase(retries - 1);
    }
    // Any other error: treat as unknown, don't block user with terms wall
    return DEFAULT_TERMS_STATUS;
  }

  return {
    accepted: !!data,
    acceptedAt: data?.accepted_at ?? null,
    version: TERMS_VERSION,
  };
}

export const useTermsAcceptance = () => {
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkTermsStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        timeoutId = setTimeout(async () => {
          const fallback = await checkTermsViaSupabase().catch(() => DEFAULT_TERMS_STATUS);
          setStatus(fallback);
          setLoading(false);
        }, 5000);

        const useMockFallback = getGlobalMockDataEnabled() || config.dev.allowMockData;
        const data = await fetchJson<TermsStatus>('/api/user/terms-status', undefined, {
          useMockData: useMockFallback,
          mockData: DEFAULT_TERMS_STATUS,
        });
        clearTimeout(timeoutId);
        setStatus(data);
      } catch (err) {
        clearTimeout(timeoutId);
        // Backend down — query Supabase directly (with retry for session not-ready 403s)
        const fallback = await checkTermsViaSupabase().catch(() => DEFAULT_TERMS_STATUS);
        setStatus(fallback);
        setError(null);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    checkTermsStatus();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { status, loading, error };
};

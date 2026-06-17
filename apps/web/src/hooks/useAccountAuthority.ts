import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { useAuth } from '../lib/supabase';
import type { ServerAccountAuthority } from '../lib/accountAuthority';

const DEFAULT_AUTHORITY: ServerAccountAuthority = {
  role: 'user',
  roleLabel: 'User',
  isFounderAccount: false,
  isPrivileged: false,
  privilegeSource: null,
  effectivePlanType: 'free',
  canBeBilled: true,
  canCancelSubscription: true,
  canLoseAccess: true,
  canAccessAdmin: false,
  canAccessDevConsole: false,
};

/**
 * Fetches canonical role authority from the server.
 * Frontend must never infer roles from JWT metadata or env vars.
 */
export function useAccountAuthority() {
  const { user, loading: authLoading } = useAuth();
  const [authority, setAuthority] = useState<ServerAccountAuthority | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setAuthority(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<ServerAccountAuthority>('/api/user/authority');
      setAuthority(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account authority');
      setAuthority(DEFAULT_AUTHORITY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAuthority(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [authLoading, user, refresh]);

  return {
    authority,
    loading: authLoading || loading,
    error,
    refresh,
  };
}

/**
 * Hook to check if mock data should be used
 * When user is logged in, always returns false so they never see mock data.
 */

import { getGlobalMockDataEnabled, getIsUserLoggedIn } from '../contexts/MockDataContext';
import { useAuth } from '../lib/supabase';
import { useMockData } from '../contexts/MockDataContext';
import { config } from '../config/env';

/**
 * Returns true if mock data should be used.
 * Always returns false when user is logged in (real account = real data only).
 * When mock is on and there is no user (Demo Mode or unauthenticated), returns true even during auth load so mock UI shows immediately.
 */
export function useShouldUseMockData(): boolean {
  const { user, loading: authLoading } = useAuth();
  const { useMockData: globalEnabled } = useMockData();
  if (user) return false;
  if (globalEnabled) return true; // Demo Mode or mock on + no user → show mock (including during auth load)
  if (authLoading) return false;
  return globalEnabled ?? config.dev.allowMockData;
}

/**
 * Non-hook version for use outside React components.
 * When user is logged in (global set by MockDataProvider), returns false.
 */
export function shouldUseMockData(): boolean {
  if (getIsUserLoggedIn()) return false;
  return getGlobalMockDataEnabled() || config.dev.allowMockData;
}








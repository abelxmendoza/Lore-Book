/**
 * Hook to check if mock data should be used.
 * - Logged-in user: never mock (real data only).
 * - Guest: mock only when they chose Demo Mode (useMockData true); otherwise clean slate.
 * - Not logged in, not guest (e.g. pre-auth): use toggle or dev default.
 */

import { getGlobalMockDataEnabled, getGlobalIsGuest, getIsUserLoggedIn } from '../contexts/MockDataContext';
import { useAuth } from '../lib/supabase';
import { useMockData } from '../contexts/MockDataContext';
import { useGuest } from '../contexts/GuestContext';
import { config } from '../config/env';

/**
 * Returns true if mock data should be used.
 * Guest mode = clean slate unless they explicitly chose Demo Mode (globalEnabled true).
 */
export function useShouldUseMockData(): boolean {
  const { user, loading: authLoading } = useAuth();
  const { useMockData: globalEnabled } = useMockData();
  const { isGuest } = useGuest();

  if (user) return false;
  // Guest: mock only in Demo Mode; otherwise clean slate (ignore dev default)
  if (isGuest) return globalEnabled === true;
  if (globalEnabled) return true;
  if (authLoading) return false;
  return globalEnabled ?? config.dev.allowMockData;
}

/**
 * Non-hook version for use outside React components.
 * Guest with mock off = clean slate (false). Demo Mode guest = mock on (true).
 */
export function shouldUseMockData(): boolean {
  if (getIsUserLoggedIn()) return false;
  if (getGlobalIsGuest() && !getGlobalMockDataEnabled()) return false;
  return getGlobalMockDataEnabled() || config.dev.allowMockData;
}








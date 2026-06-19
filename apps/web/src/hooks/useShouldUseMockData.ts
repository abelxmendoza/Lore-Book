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

/**
 * Returns true when upload flows should be simulated locally (animated progress, no API).
 * Guest sessions always simulate; demo/mock mode uses the same path.
 */
export function useShouldSimulateUploadFlow(): boolean {
  const { user, loading: authLoading } = useAuth();
  const { isGuest } = useGuest();
  const mockEnabled = useShouldUseMockData();

  if (user) return false;
  if (isGuest) return true;
  if (authLoading) return false;
  return mockEnabled;
}

export function shouldSimulateUploadFlow(): boolean {
  if (getIsUserLoggedIn()) return false;
  if (getGlobalIsGuest()) return true;
  return shouldUseMockData();
}

/**
 * Chat simulation policy:
 * - Logged-in users: real chat.
 * - Deployed production guest/demo: always simulated, so unauthenticated
 *   runtime can never reach the LLM/OpenAI chat path.
 * - Development guest clean-slate: may use /api/guest/stream freely for testing
 *   the guest backend path. Demo/mock still simulates locally.
 */
export function useShouldSimulateChat(): boolean {
  const { user, loading: authLoading } = useAuth();
  const { isGuest } = useGuest();
  const mockEnabled = useShouldUseMockData();

  if (user) return false;
  if (config.env.isProduction && isGuest) return true;
  if (isGuest) return mockEnabled;
  if (authLoading) return false;
  return mockEnabled;
}

export function shouldSimulateChat(): boolean {
  if (getIsUserLoggedIn()) return false;
  if (config.env.isProduction && getGlobalIsGuest()) return true;
  if (getGlobalIsGuest()) return shouldUseMockData();
  return shouldUseMockData();
}

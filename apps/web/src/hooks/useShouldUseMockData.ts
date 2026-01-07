/**
 * Hook to check if mock data should be used
 * Respects the global mock data toggle from MockDataContext
 */

import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import { config } from '../config/env';

/**
 * Returns true if mock data should be used based on:
 * 1. Global mock data toggle (from MockDataContext)
 * 2. Environment config (fallback)
 */
export function useShouldUseMockData(): boolean {
  // Check global toggle first (set by user)
  const globalEnabled = getGlobalMockDataEnabled();
  
  // If global toggle is explicitly set, use it
  if (globalEnabled !== undefined) {
    return globalEnabled;
  }
  
  // Fallback to environment config
  return config.dev.allowMockData;
}

/**
 * Non-hook version for use outside React components
 * Use this in utility functions, API calls, etc.
 */
export function shouldUseMockData(): boolean {
  return getGlobalMockDataEnabled() || config.dev.allowMockData;
}








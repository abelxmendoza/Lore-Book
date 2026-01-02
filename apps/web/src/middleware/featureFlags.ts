/**
 * Feature Flag Middleware
 * Injects feature flags into client components
 */

import { isExperimentalEnabled } from '../config/featureFlags';

/**
 * Check if experimental features should be unlocked
 * If ENABLE_EXPERIMENTAL=true and user is admin, unlock all flags
 */
export const shouldUnlockExperimental = (isAdmin: boolean): boolean => {
  return isExperimentalEnabled() && isAdmin;
};

/**
 * Get feature flag value with experimental override
 */
export const getFeatureFlagWithOverride = (
  flagValue: boolean,
  isAdmin: boolean
): boolean => {
  if (shouldUnlockExperimental(isAdmin)) {
    return true;
  }
  return flagValue;
};

/**
 * Hide experimental UI unless flags are true
 */
export const shouldShowExperimental = (
  flagValue: boolean,
  isAdmin: boolean
): boolean => {
  return getFeatureFlagWithOverride(flagValue, isAdmin);
};


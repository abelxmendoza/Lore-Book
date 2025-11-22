/**
 * Feature Flags System
 * Controls experimental and optional features
 */

import { config } from './env';

export type FeatureFlag = 
  | 'timelinePlayback'
  | 'memoryClusters'
  | 'characterGraph'
  | 'adminConsole'
  | 'devDiagnostics';

export const featureFlags: Record<FeatureFlag, boolean> = {
  timelinePlayback: false,
  memoryClusters: false,
  characterGraph: false,
  // Admin console only enabled in development or for admins
  adminConsole: !config.isProduction,
  // Dev diagnostics completely disabled in production
  devDiagnostics: !config.isProduction,
};

/**
 * Check if experimental features are enabled
 */
export const isExperimentalEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_EXPERIMENTAL === 'true' || 
         import.meta.env.MODE === 'development';
};

/**
 * Get feature flag value
 * If experimental is enabled and user is admin, all flags are unlocked
 */
export const getFeatureFlag = (
  flag: FeatureFlag, 
  isAdmin: boolean = false
): boolean => {
  const baseValue = featureFlags[flag];
  
  // If experimental is enabled and user is admin, unlock all flags
  if (isExperimentalEnabled() && isAdmin) {
    return true;
  }
  
  return baseValue;
};


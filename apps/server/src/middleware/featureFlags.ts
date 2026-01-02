/**
 * Feature Flag Middleware Helpers
 */

import { featureFlags, type FeatureFlag } from '../../web/src/config/featureFlags';
import { config } from '../config';

export interface User {
  id: string;
  role?: string;
  user_metadata?: {
    role?: string;
  };
  app_metadata?: {
    role?: string;
  };
}

export interface Env {
  ENABLE_EXPERIMENTAL?: string;
  API_ENV?: string;
}

/**
 * Get active feature flags for a user
 */
export function getActiveFlags(user?: User | null, env?: Env): Record<FeatureFlag, boolean> {
  const flags = { ...featureFlags };
  const envConfig = env || {
    ENABLE_EXPERIMENTAL: config.enableExperimental ? 'true' : 'false',
    API_ENV: config.apiEnv
  };

  // If experimental is enabled and user is admin, unlock all flags
  if (envConfig.ENABLE_EXPERIMENTAL === 'true' && user) {
    const userRole = user.role || 
                     user.user_metadata?.role || 
                     user.app_metadata?.role;
    
    if (userRole === 'admin' || userRole === 'developer') {
      for (const key in flags) {
        flags[key as FeatureFlag] = true;
      }
    }
  }

  return flags;
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(
  flag: FeatureFlag,
  user?: User | null,
  env?: Env
): boolean {
  const activeFlags = getActiveFlags(user, env);
  return activeFlags[flag] === true;
}


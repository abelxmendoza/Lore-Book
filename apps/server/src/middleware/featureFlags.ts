/**
 * Feature Flag Middleware Helpers
 *
 * Role checks delegate to accountAuthority — never read user_metadata.role.
 */

import { config } from '../config';
import {
  resolveAccountAuthorityFromAuthUser,
  type AuthUserLike,
} from '../lib/accountAuthority';

export type FeatureFlag =
  | 'timelinePlayback'
  | 'memoryClusters'
  | 'characterGraph'
  | 'adminConsole'
  | 'devDiagnostics';

const featureFlags: Record<FeatureFlag, boolean> = {
  timelinePlayback: false,
  memoryClusters: false,
  characterGraph: false,
  adminConsole: config.apiEnv !== 'production',
  devDiagnostics: config.apiEnv !== 'production',
};

export interface User extends AuthUserLike {
  role?: string;
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
    API_ENV: config.apiEnv,
  };

  if (envConfig.ENABLE_EXPERIMENTAL === 'true' && user) {
    const authority = resolveAccountAuthorityFromAuthUser(user);
    if (authority.isPrivileged) {
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

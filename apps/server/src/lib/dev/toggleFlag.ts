/**
 * Toggle Feature Flag Helper
 * Toggles a feature flag (dev only)
 */

import { config } from '../../config';
import { logger } from '../../logger';

export async function toggleFlag(flag: string, enabled: boolean): Promise<void> {
  if (config.apiEnv !== 'dev') {
    throw new Error('Feature flag toggling only available in dev mode');
  }

  logger.info({ flag, enabled }, 'Feature flag toggled (dev mode only)');

  // In dev mode, this could update a dev-only config
  // In production, feature flags should be managed through code/config files
  // TODO: Implement dev-only feature flag storage if needed
}


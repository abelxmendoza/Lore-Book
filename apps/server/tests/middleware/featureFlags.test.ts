import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureFlag } from '../../src/middleware/featureFlags';
const mockFeatureFlags: Record<string, boolean> = {
  timelinePlayback: false,
  memoryClusters: false,
  characterGraph: false,
  adminConsole: true,
  devDiagnostics: false,
};
vi.mock('../../web/src/config/featureFlags', () => ({
  featureFlags: mockFeatureFlags,
}));
vi.mock('../../src/config', () => ({
  config: {
    enableExperimental: false,
    apiEnv: 'dev',
    adminUserId: 'admin-uuid',
    adminEmail: 'admin@example.com',
    ownerUserId: 'owner-uuid',
    ownerEmail: 'founder@example.com',
    developerEmail: 'dev@example.com',
  },
}));

describe('featureFlags middleware helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.timelinePlayback = false;
    mockFeatureFlags.memoryClusters = false;
  });

  describe('getActiveFlags', () => {
    it('should return a copy of base feature flags when no user', async () => {
      const { getActiveFlags } = await import('../../src/middleware/featureFlags');
      const flags = getActiveFlags(null);
      expect(flags).toEqual(expect.objectContaining({
        timelinePlayback: false,
        adminConsole: true,
      }));
      expect(flags).not.toBe(mockFeatureFlags);
    });

    it('should unlock all flags when ENABLE_EXPERIMENTAL and user is admin via app_metadata', async () => {
      const { getActiveFlags } = await import('../../src/middleware/featureFlags');
      const user = { id: 'u1', app_metadata: { role: 'admin' } };
      const flags = getActiveFlags(user, { ENABLE_EXPERIMENTAL: 'true', API_ENV: 'production' });
      expect(flags.timelinePlayback).toBe(true);
      expect(flags.memoryClusters).toBe(true);
    });

    it('should not unlock all flags when ENABLE_EXPERIMENTAL but user is standard', async () => {
      const { getActiveFlags } = await import('../../src/middleware/featureFlags');
      const user = { id: 'u1', role: 'standard_user' };
      const flags = getActiveFlags(user, { ENABLE_EXPERIMENTAL: 'true' });
      expect(flags.timelinePlayback).toBe(false);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return false for disabled flag', async () => {
      const { isFeatureEnabled } = await import('../../src/middleware/featureFlags');
      expect(isFeatureEnabled('timelinePlayback')).toBe(false);
    });

    it('should return true for enabled base flag', async () => {
      const { isFeatureEnabled } = await import('../../src/middleware/featureFlags');
      expect(isFeatureEnabled('adminConsole' as FeatureFlag)).toBe(true);
    });

    it('should return true for any flag when experimental and admin', async () => {
      const { isFeatureEnabled } = await import('../../src/middleware/featureFlags');
      const user = { id: 'u1', app_metadata: { role: 'admin' } };
      expect(isFeatureEnabled('timelinePlayback', user, { ENABLE_EXPERIMENTAL: 'true' })).toBe(true);
    });
  });
});

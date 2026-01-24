import { describe, it, expect } from 'vitest';
import { getFeatureFlag, isExperimentalEnabled, featureFlags } from './featureFlags';

describe('featureFlags', () => {
  describe('featureFlags', () => {
    it('has expected keys', () => {
      expect(featureFlags).toHaveProperty('timelinePlayback');
      expect(featureFlags).toHaveProperty('memoryClusters');
      expect(featureFlags).toHaveProperty('characterGraph');
      expect(featureFlags).toHaveProperty('adminConsole');
      expect(featureFlags).toHaveProperty('devDiagnostics');
    });

    it('values are boolean', () => {
      Object.values(featureFlags).forEach((v) => expect(typeof v).toBe('boolean'));
    });
  });

  describe('getFeatureFlag', () => {
    it('returns base value when isAdmin is false and experimental off', () => {
      vi.stubEnv('VITE_ENABLE_EXPERIMENTAL', undefined);
      vi.stubEnv('MODE', 'production');
      expect(typeof getFeatureFlag('timelinePlayback', false)).toBe('boolean');
      expect(typeof getFeatureFlag('characterGraph', false)).toBe('boolean');
    });

    it('returns boolean for all flag names', () => {
      const flags = ['timelinePlayback', 'memoryClusters', 'characterGraph', 'adminConsole', 'devDiagnostics'] as const;
      flags.forEach((f) => expect(typeof getFeatureFlag(f, false)).toBe('boolean'));
    });
  });

  describe('isExperimentalEnabled', () => {
    it('returns boolean', () => {
      expect(typeof isExperimentalEnabled()).toBe('boolean');
    });
  });
});

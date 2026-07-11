import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordProviderFailure,
  getProviderPressure,
  shouldRunOptionalEnrichment,
  resetProviderPressureForTests,
  pressureBackoffMultiplier,
} from '../../../src/services/chat/providerPressurePolicy';

describe('providerPressurePolicy', () => {
  beforeEach(() => resetProviderPressureForTests());

  it('starts normal', () => {
    expect(getProviderPressure()).toBe('normal');
    expect(shouldRunOptionalEnrichment()).toBe(true);
  });

  it('degrades under repeated rate limits', () => {
    for (let i = 0; i < 3; i++) recordProviderFailure('rate_limit');
    expect(getProviderPressure()).toBe('degraded');
    expect(shouldRunOptionalEnrichment()).toBe(false);
    expect(pressureBackoffMultiplier()).toBeGreaterThan(1);
  });

  it('goes critical under quota exhaustion', () => {
    recordProviderFailure('quota_exhausted');
    recordProviderFailure('quota_exhausted');
    expect(getProviderPressure()).toBe('critical');
    expect(shouldRunOptionalEnrichment()).toBe(false);
  });
});

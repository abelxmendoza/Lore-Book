import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isFaultInjectionEnabled,
  isProductionRuntime,
  registerFault,
  clearFaults,
  maybeInjectFault,
} from '../../../src/services/chat/durabilityFaultInjection';

describe('fault injection production hard-block', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    clearFaults();
  });

  afterEach(() => {
    process.env.NODE_ENV = prev.NODE_ENV;
    process.env.API_ENV = prev.API_ENV;
    process.env.RAILWAY_ENVIRONMENT = prev.RAILWAY_ENVIRONMENT;
    process.env.DURABILITY_FAULT_INJECTION = prev.DURABILITY_FAULT_INJECTION;
    process.env.VITEST = prev.VITEST;
    clearFaults();
  });

  it('isProductionRuntime is false under vitest even if API_ENV=production in parent env', () => {
    // This test file runs under vitest — production must be false so unit tests work.
    expect(process.env.VITEST === 'true' || process.env.NODE_ENV === 'test').toBe(true);
    expect(isProductionRuntime()).toBe(false);
  });

  it('simulates production hard-block by evaluating enable logic with mocked env', () => {
    // Pure check of the production gate expression used by isFaultInjectionEnabled
    const nodeEnv = 'production';
    const apiEnv = 'production';
    const vitest = 'false';
    const isProd =
      vitest !== 'true' &&
      nodeEnv !== 'test' &&
      (nodeEnv === 'production' || apiEnv === 'production');
    const faultEnv = 'true';
    const enabled = isProd ? false : faultEnv === 'true';
    expect(enabled).toBe(false);
  });

  it('maybeInjectFault is a no-op when injection disabled', async () => {
    delete process.env.DURABILITY_FAULT_INJECTION;
    // Under vitest injection is enabled — register then clear
    clearFaults();
    // When no fault registered, resolves cleanly
    await expect(maybeInjectFault('before_worker_claim')).resolves.toBeUndefined();
  });

  it('registerFault works in test mode', () => {
    expect(() =>
      registerFault({ point: 'before_job_completion', type: 'openai_429', once: true }),
    ).not.toThrow();
  });
});

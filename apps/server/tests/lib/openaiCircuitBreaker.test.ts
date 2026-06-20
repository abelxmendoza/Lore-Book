import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/securityLog', () => ({
  logSecurityEvent: vi.fn(),
}));

import {
  assertOpenAiCircuitClosed,
  createOpenAiCircuitOpenError,
  isOpenAiCircuitOpen,
  isOpenAiCircuitOpenError,
  isOpenAiRateLimitError,
  recordOpenAiFailure,
  resetOpenAiCircuitBreakerForTests,
} from '../../src/lib/openaiCircuitBreaker';

describe('openaiCircuitBreaker', () => {
  beforeEach(() => {
    resetOpenAiCircuitBreakerForTests();
  });

  it('detects OpenAI rate-limit errors', () => {
    expect(isOpenAiRateLimitError({ status: 429 })).toBe(true);
    expect(isOpenAiRateLimitError(new Error('insufficient_quota'))).toBe(true);
    expect(isOpenAiRateLimitError(new Error('network timeout'))).toBe(false);
  });

  it('opens after repeated rate-limit failures', () => {
    expect(isOpenAiCircuitOpen()).toBe(false);
    for (let i = 0; i < 5; i += 1) {
      recordOpenAiFailure({ status: 429 });
    }
    expect(isOpenAiCircuitOpen()).toBe(true);
    expect(() => assertOpenAiCircuitClosed()).toThrow(/circuit breaker open/i);
  });

  it('ignores non-rate-limit failures', () => {
    for (let i = 0; i < 5; i += 1) {
      recordOpenAiFailure(new Error('500 internal'));
    }
    expect(isOpenAiCircuitOpen()).toBe(false);
  });

  it('identifies circuit-open errors', () => {
    const err = createOpenAiCircuitOpenError();
    expect(isOpenAiCircuitOpenError(err)).toBe(true);
    expect(isOpenAiCircuitOpenError(new Error('network timeout'))).toBe(false);
  });
});

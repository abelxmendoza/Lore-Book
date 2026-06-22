import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    mcpReadRpmFree: 3,
    mcpReadRpmPremium: 10,
  },
}));

vi.mock('../../src/services/usageTracking', () => ({
  getCurrentUsage: vi.fn(async () => ({ isPremium: false })),
}));

vi.mock('../../src/services/postgresRateLimitService', () => ({
  checkPostgresRateLimit: vi.fn(async () => null),
}));

vi.mock('../../src/mcp/mcpAuditService', () => ({
  auditMcpToolCall: vi.fn(async () => undefined),
}));

import {
  checkMcpRateLimit,
  resetMcpRateLimitsForTests,
  resolveMcpReadRpm,
  setMcpRateLimitHeaders,
} from '../../src/mcp/mcpRateLimit';
import {
  isChatGptConnectorIp,
  resetChatGptIpCacheForTests,
} from '../../src/mcp/mcpChatGptIpAllowlist';
import { computeExponentialBackoffMs, retryWithExponentialBackoff } from '../../src/lib/openaiRetry';

describe('mcpRateLimit', () => {
  beforeEach(() => {
    resetMcpRateLimitsForTests();
  });

  it('uses tier-specific RPM limits', () => {
    expect(resolveMcpReadRpm('free')).toBe(3);
    expect(resolveMcpReadRpm('premium')).toBe(10);
  });

  it('blocks after free-tier limit is exhausted', async () => {
    const userId = 'user-a';
    const clientId = 'cursor';

    for (let i = 0; i < 3; i += 1) {
      const ok = await checkMcpRateLimit(userId, clientId, 'free');
      expect(ok.allowed).toBe(true);
    }

    const blocked = await checkMcpRateLimit(userId, clientId, 'free');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetSec).toBeGreaterThan(0);
    }
  });

  it('sets OpenAI-style rate limit headers', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as import('express').Response;

    setMcpRateLimitHeaders(res, 60, 59, 45);
    expect(headers['x-ratelimit-limit-requests']).toBe('60');
    expect(headers['x-ratelimit-remaining-requests']).toBe('59');
    expect(headers['x-ratelimit-reset-requests']).toBe('45s');
  });
});

describe('mcpChatGptIpAllowlist', () => {
  beforeEach(() => {
    resetChatGptIpCacheForTests();
  });

  it('matches IPv4 CIDR prefixes', () => {
    const rules = [{ family: 4 as const, base: 0x0a000000n, bits: 8 }];
    expect(isChatGptConnectorIp('10.0.0.1', rules)).toBe(true);
    expect(isChatGptConnectorIp('11.0.0.1', rules)).toBe(false);
  });
});

describe('openaiRetry', () => {
  it('retries retryable errors with backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }))
      .mockResolvedValueOnce('ok');

    const result = await retryWithExponentialBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
      jitterRatio: 0,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('computes exponential delay', () => {
    expect(computeExponentialBackoffMs(1, 1000, 30000, 0)).toBe(1000);
    expect(computeExponentialBackoffMs(2, 1000, 30000, 0)).toBe(2000);
    expect(computeExponentialBackoffMs(5, 1000, 30000, 0)).toBe(16000);
  });
});

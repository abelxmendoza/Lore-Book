import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('../../src/services/securityLog', () => ({
  logSecurityEvent: vi.fn(),
}));

vi.mock('../../src/services/postgresRateLimitService', () => ({
  checkPostgresRateLimit: vi.fn().mockResolvedValue(null),
  isPostgresRateLimitEnabled: vi.fn().mockReturnValue(false),
}));

import { resolveApiRateTierRulesForTests } from '../../src/middleware/tieredRateLimit';

const mockReq = (path: string, method = 'GET', userId?: string): Partial<Request> =>
  ({
    originalUrl: path,
    url: path,
    path,
    method,
    ip: '203.0.113.10',
    headers: { 'user-agent': 'test' },
    user: userId ? { id: userId } : undefined,
  }) as Partial<Request>;

describe('tieredRateLimit', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.API_ENV = 'production';
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it('skips health endpoints', () => {
    expect(resolveApiRateTierRulesForTests(mockReq('/api/health') as Request)).toEqual([]);
  });

  it('classifies guest chat as guest tier only', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/guest/stream', 'POST') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['guest']);
  });

  it('classifies AI chat with write + burst + ai tiers', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/chat/stream', 'POST', 'user-1') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['ai', 'write', 'write_burst']);
  });

  it('classifies compute rescan routes', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/conversation/lexical-rescan', 'POST', 'user-1') as Request
    );
    expect(rules.map((r) => r.tier)).toContain('compute');
  });
});

describe('rateLimitCore', () => {
  it('resets window after expiry', async () => {
    const { checkRateLimit, createRateLimitStore } = await import('../../src/lib/rateLimitCore');
    const store = createRateLimitStore();
    const now = Date.now();
    checkRateLimit(store, 'k', 2, 1000, now);
    checkRateLimit(store, 'k', 2, 1000, now);
    const blocked = checkRateLimit(store, 'k', 2, 1000, now);
    expect(blocked.allowed).toBe(false);
    const after = checkRateLimit(store, 'k', 2, 1000, now + 1001);
    expect(after.allowed).toBe(true);
  });
});

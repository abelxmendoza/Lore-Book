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

  it('skips CORS preflight OPTIONS so they do not consume the read budget', () => {
    expect(
      resolveApiRateTierRulesForTests(mockReq('/api/books/characters', 'OPTIONS') as Request),
    ).toEqual([]);
  });

  it('allows a high SPA read ceiling in production', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/books/characters', 'GET', 'user-1') as Request,
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].tier).toBe('read');
    expect(rules[0].max).toBeGreaterThanOrEqual(6000);
  });

  it('classifies guest chat as guest tier only', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/guest/stream', 'POST') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['guest']);
  });

  it('classifies AI chat with ai tier only (not shared write budget)', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/chat/stream', 'POST', 'user-1') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['ai']);
    expect(rules.map((r) => r.tier)).not.toContain('write');
    expect(rules.map((r) => r.tier)).not.toContain('write_burst');
  });

  it('classifies non-stream chat POST with ai tier only', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/chat', 'POST', 'user-1') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['ai']);
  });

  it('keeps ordinary writes on write + write_burst', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/journal/autosave', 'POST', 'user-1') as Request
    );
    expect(rules.map((r) => r.tier)).toEqual(['write', 'write_burst']);
  });

  it('excludes composer lexical preview from global tiers (route limiter only)', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/lexical/preview', 'POST', 'user-1') as Request
    );
    expect(rules).toEqual([]);
  });

  it('excludes lorebook-parse from global tiers so typing cannot starve chat writes', () => {
    const rules = resolveApiRateTierRulesForTests(
      mockReq('/api/conversation/lorebook-parse', 'POST', 'user-1') as Request
    );
    expect(rules).toEqual([]);
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

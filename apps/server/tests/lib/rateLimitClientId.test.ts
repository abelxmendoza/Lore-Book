import { describe, it, expect } from 'vitest';
import type { Request } from 'express';

import { getRateLimitClientId, peekBearerSub } from '../../src/lib/rateLimitClientId';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function fakeJwt(sub: string): string {
  return `${b64url({ alg: 'none' })}.${b64url({ sub })}.sig`;
}

describe('peekBearerSub', () => {
  it('reads sub from a Bearer JWT payload', () => {
    expect(peekBearerSub(`Bearer ${fakeJwt('user-abc')}`)).toBe('user-abc');
  });

  it('returns null for missing or malformed tokens', () => {
    expect(peekBearerSub(undefined)).toBeNull();
    expect(peekBearerSub('Bearer nope')).toBeNull();
    expect(peekBearerSub('Bearer a.b')).toBeNull();
  });
});

describe('getRateLimitClientId', () => {
  it('prefers req.user.id over JWT and IP', () => {
    const req = {
      user: { id: 'authed-user' },
      ip: '203.0.113.10',
      headers: { authorization: `Bearer ${fakeJwt('jwt-user')}` },
    } as unknown as Request;
    expect(getRateLimitClientId(req)).toBe('authed-user');
  });

  it('peeks JWT sub when auth middleware has not run yet', () => {
    const req = {
      ip: '203.0.113.10',
      headers: { authorization: `Bearer ${fakeJwt('jwt-user')}` },
    } as unknown as Request;
    expect(getRateLimitClientId(req)).toBe('jwt-user');
  });

  it('falls back to IP when no user or token', () => {
    const req = {
      ip: '203.0.113.10',
      headers: {},
    } as unknown as Request;
    expect(getRateLimitClientId(req)).toBe('203.0.113.10');
  });
});

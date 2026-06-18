import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for shared audit helpers (founder resolution, CLI parsing, formatting).
 */

const authState = vi.hoisted(() => ({
  listUsers: vi.fn(),
}));

vi.mock('../../src/config', () => ({
  config: {
    ownerUserId: '',
    ownerEmail: 'founder@lorebook.test',
    developerEmail: 'dev@lorebook.test',
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { auth: { admin: { listUsers: authState.listUsers } } },
}));

import {
  estTokens,
  pct,
  pctNum,
  parseArg,
  parseFlag,
  resolveUserIds,
  requireUserIds,
  resolveFounderId,
  resolveAccount,
} from '../../scripts/lib/auditCommon';

describe('auditCommon — formatting (unit)', () => {
  it('estTokens rounds up by char/4', () => {
    expect(estTokens('')).toBe(0);
    expect(estTokens('abcd')).toBe(1);
    expect(estTokens('abcde')).toBe(2);
  });

  it('pct returns 0% when denominator is zero', () => {
    expect(pct(5, 0)).toBe('0%');
    expect(pctNum(5, 0)).toBe(0);
  });

  it('pct formats a ratio', () => {
    expect(pct(1, 4)).toBe('25.0%');
    expect(pctNum(3, 4)).toBe(75);
  });
});

describe('auditCommon — CLI parsing (unit)', () => {
  it('parseArg returns the token after a flag', () => {
    expect(parseArg(['--user-id', 'u1', '--check', 'memory'], '--user-id')).toBe('u1');
    expect(parseArg(['--check'], '--user-id')).toBeUndefined();
  });

  it('parseFlag detects presence', () => {
    expect(parseFlag(['--full-rag'], '--full-rag')).toBe(true);
    expect(parseFlag([], '--full-rag')).toBe(false);
  });

  it('resolveUserIds prefers CLI over env', () => {
    const ORIGINAL = { ...process.env };
    process.env.TARGET_USER_ID = 'from-env';
    expect(resolveUserIds(['--user-id', 'from-cli'], ['TARGET_USER_ID'])).toEqual(['from-cli']);
    process.env = ORIGINAL;
  });

  it('resolveUserIds splits comma-separated env values', () => {
    const ORIGINAL = { ...process.env };
    process.env.EPISODE_USER_ID = 'a, b ,c';
    expect(resolveUserIds([], ['EPISODE_USER_ID'])).toEqual(['a', 'b', 'c']);
    process.env = ORIGINAL;
  });

  it('requireUserIds throws with a helpful message when missing', () => {
    expect(() => requireUserIds([], ['TARGET_USER_ID'], 'need a user')).toThrow(/need a user/);
  });
});

describe('auditCommon — resolveFounderId / resolveAccount (integration)', () => {
  beforeEach(() => {
    authState.listUsers.mockReset();
  });

  it('resolveFounderId matches admin role via auth lookup', async () => {
    authState.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'u-regular', email: 'x@y.com', app_metadata: { role: 'user' } },
          { id: 'u-founder', email: 'founder@lorebook.test', app_metadata: { role: 'admin' } },
        ],
      },
      error: null,
    });
    await expect(resolveFounderId()).resolves.toBe('u-founder');
  });

  it('resolveFounderId throws when no founder can be resolved', async () => {
    authState.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    await expect(resolveFounderId()).rejects.toThrow(/Could not resolve founder/);
  });

  it('resolveAccount returns null for a missing developer', async () => {
    authState.listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'founder@lorebook.test', app_metadata: { role: 'admin' } }] },
      error: null,
    });
    await expect(resolveAccount('developer')).resolves.toBeNull();
  });
});

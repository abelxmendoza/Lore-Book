import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

vi.mock('../../src/config', () => ({
  config: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseServiceRoleKey: 'service-key',
  },
}));

import { authenticateMcpBearer } from '../../src/mcp/mcpAuth';

describe('mcpAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_AUTH_FOR_DEV;
    delete process.env.NODE_ENV;
    delete process.env.API_ENV;
  });

  it('returns null for invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: null, error: { message: 'bad' } });
    await expect(authenticateMcpBearer('bad-token')).resolves.toBeNull();
  });

  it('returns user for valid token', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'a@b.com',
          last_sign_in_at: '2026-01-01T00:00:00Z',
          user_metadata: { full_name: 'Test User' },
        },
      },
      error: null,
    });

    const result = await authenticateMcpBearer('good-token');
    expect(result?.user).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      lastSignInAt: '2026-01-01T00:00:00Z',
      fullName: 'Test User',
    });
  });

  it('supports dev bypass token when DISABLE_AUTH_FOR_DEV is set', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_AUTH_FOR_DEV = 'true';

    const result = await authenticateMcpBearer('dev');
    expect(result?.user?.id).toBe('00000000-0000-0000-0000-000000000000');
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

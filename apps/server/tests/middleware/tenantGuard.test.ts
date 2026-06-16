import { describe, it, expect, vi, beforeEach } from 'vitest';

import { requireSelfUserIdParam } from '../../src/middleware/tenantGuard';

describe('requireSelfUserIdParam', () => {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows request when param matches authenticated user', () => {
    const middleware = requireSelfUserIdParam('userId');
    const req = { user: { id: 'user-a' }, params: { userId: 'user-a' } } as any;
    middleware(req, { status } as any, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 403 when param does not match authenticated user', () => {
    const middleware = requireSelfUserIdParam('userId');
    const req = { user: { id: 'user-a' }, params: { userId: 'user-b' } } as any;
    middleware(req, { status } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const middleware = requireSelfUserIdParam('userId');
    const req = { params: { userId: 'user-b' } } as any;
    middleware(req, { status } as any, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

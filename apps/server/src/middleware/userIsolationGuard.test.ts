import { describe, expect, it } from 'vitest';

import { assertPayloadOwnedByUser, shouldBypassUserIsolation } from './userIsolationGuard';

describe('user isolation guard', () => {
  it('allows payloads owned by the authenticated user', () => {
    expect(() =>
      assertPayloadOwnedByUser(
        {
          characters: [
            { id: 'char-1', user_id: 'user-1', name: 'Avery' },
            { id: 'char-2', userId: 'user-1', name: 'Blake' },
          ],
        },
        'user-1',
      ),
    ).not.toThrow();
  });

  it('blocks nested payloads owned by another user', () => {
    expect(() =>
      assertPayloadOwnedByUser(
        {
          organization: {
            id: 'org-1',
            members: [{ id: 'member-1', user_id: 'user-2' }],
          },
        },
        'user-1',
      ),
    ).toThrow(/Cross-user payload blocked/);
  });

  it('allows payloads with no owner fields', () => {
    expect(() =>
      assertPayloadOwnedByUser(
        {
          success: true,
          organizations: [{ id: 'org-1', name: 'Code Harbor Academy' }],
        },
        'user-1',
      ),
    ).not.toThrow();
  });

  it('bypasses isolation for admin console routes', () => {
    expect(shouldBypassUserIsolation({ path: '/admin/finance/subscriptions', originalUrl: '/api/admin/finance/subscriptions' })).toBe(true);
    expect(shouldBypassUserIsolation({ path: '/entries', originalUrl: '/api/entries' })).toBe(false);
  });
});

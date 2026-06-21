import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, tableData } = vi.hoisted(() => {
  const tableData: Record<string, unknown[]> = {
    organizations: [{ id: 'o1', user_id: 'u1', updated_at: '2026-01-01' }],
    organization_members: [],
    organization_stories: [],
    organization_events: [],
    organization_locations: [],
  };
  const fromMock = vi.fn((table: string) => {
    const result = { data: tableData[table] ?? [], error: null };
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'single', 'update', 'insert', 'delete']) {
      q[m] = vi.fn(() => q);
    }
    (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
    return q;
  });
  return { fromMock, tableData };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { organizationService } from '../../src/services/organizationService';

const orgReads = () => fromMock.mock.calls.filter((c) => c[0] === 'organizations').length;

describe('organizationService listOrganizations cache (egress cap)', () => {
  beforeEach(() => {
    fromMock.mockClear();
    organizationService.invalidateOrganizations('u1');
    organizationService.invalidateOrganizations('u2');
    void tableData;
  });

  it('serves a repeat call within TTL from cache (no extra DB reads)', async () => {
    await organizationService.listOrganizations('u1');
    await organizationService.listOrganizations('u1');
    await organizationService.listOrganizations('u1');
    expect(orgReads()).toBe(1);
  });

  it('re-reads after explicit invalidation', async () => {
    await organizationService.listOrganizations('u1');
    organizationService.invalidateOrganizations('u1');
    await organizationService.listOrganizations('u1');
    expect(orgReads()).toBe(2);
  });

  it('busts the cache when a mutation occurs (addEvent)', async () => {
    await organizationService.listOrganizations('u1');
    await organizationService.addEvent('u1', 'o1', { title: 't', date: '2026-01-01' });
    await organizationService.listOrganizations('u1');
    expect(orgReads()).toBe(2);
  });

  it('caches per-user (no cross-user sharing)', async () => {
    await organizationService.listOrganizations('u1');
    await organizationService.listOrganizations('u2');
    expect(orgReads()).toBe(2);
  });
});
